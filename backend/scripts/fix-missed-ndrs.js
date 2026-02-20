// Fix missed status updates — finds orders stuck in in_transit/out_for_delivery
// that actually have a different status on Delhivery (NDR, delivered, RTO, etc.)
// Usage: node backend/scripts/fix-missed-ndrs.js [--dry-run]
//
// Pass --dry-run to preview changes without updating the database

const mongoose = require('mongoose');
const https = require('https');

const MONGO_URI = 'mongodb+srv://shipsarthi:shipsarthi@cluster0.sq4227p.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const TRACKING_API = 'https://shipsarthisolutions-751713877703.europe-west1.run.app/api/shipping/public/track';

const isDryRun = process.argv.includes('--dry-run');

function fetchTracking(awb) {
  return new Promise((resolve, reject) => {
    const url = `${TRACKING_API}/${awb}`;
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON for AWB ${awb}`));
        }
      });
    }).on('error', reject).on('timeout', function() {
      this.destroy();
      reject(new Error(`Timeout for AWB ${awb}`));
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map Delhivery status to internal status
 * Same logic as webhookService.mapDelhiveryStatus (with EOD fix)
 */
function mapStatus(latestStatus) {
  const status = (latestStatus.Status || '').trim();
  const statusType = (latestStatus.StatusType || '').trim().toUpperCase();
  const statusCode = (latestStatus.StatusCode || '').trim().toUpperCase();

  // 1. StatusType-specific (DL, RT, CN)
  if (statusType === 'DL') {
    if (status.toLowerCase().includes('rto')) return 'rto_delivered';
    return 'delivered';
  }
  if (statusType === 'RT') return 'rto_in_transit';
  if (statusType === 'CN') return 'cancelled';

  // 2. Official Delhivery NDR StatusCodes (whitelist from NDR API docs)
  const NDR_STATUS_CODES = new Set([
    'EOD-3',   // Delivery Rescheduled by Customer
    'EOD-6',   // Consignee Unavailable
    'EOD-11',  // Address Incomplete / Incorrect
    'EOD-15',  // Customer not available
    'EOD-16',  // Refused by Customer — COD not ready
    'EOD-43',  // Cash not ready
    'EOD-69',  // Customer wants open delivery
    'EOD-74',  // Consignee Refused
    'EOD-86',  // Door Locked / Premises Closed
    'EOD-104', // Customer wants to reschedule
    'ST-108',  // Shipment seized by customer
  ]);
  if (NDR_STATUS_CODES.has(statusCode)) {
    return 'ndr';
  }

  // 3. Status string mapping
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === 'delivered' || lowerStatus === 'dto') return 'delivered';
  if (lowerStatus === 'undelivered' || lowerStatus === 'customer not available' ||
      lowerStatus === 'customer refused' || lowerStatus === 'incomplete address' ||
      lowerStatus === 'cash not ready' || lowerStatus === 'consignee not available' ||
      lowerStatus === 'delivery attempted') return 'ndr';
  if (lowerStatus === 'rto' || lowerStatus === 'rto initiated') return 'rto_in_transit';
  if (lowerStatus === 'rto delivered') return 'rto_delivered';
  if (lowerStatus === 'dispatched' || lowerStatus === 'out for delivery') return 'out_for_delivery';
  if (lowerStatus === 'in transit' || lowerStatus === 'pending') return 'in_transit';
  if (lowerStatus === 'canceled' || lowerStatus === 'cancelled' || lowerStatus === 'closed') return 'cancelled';
  if (lowerStatus === 'lost' || lowerStatus === 'damaged') return 'lost';

  return null; // unknown — don't update
}

async function fixMissedStatuses() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find orders stuck in non-terminal statuses with waybills
    const candidates = await db.collection('orders').find({
      status: { $in: ['in_transit', 'out_for_delivery', 'pickups_manifests', 'ready_to_ship'] },
      'delhivery_data.waybill': { $exists: true, $ne: null }
    }, {
      projection: {
        order_id: 1,
        status: 1,
        'delhivery_data.waybill': 1,
        user_id: 1,
        ndr_info: 1
      }
    }).toArray();

    console.log(`Found ${candidates.length} orders in non-terminal statuses with waybills\n`);
    console.log('='.repeat(70));
    if (isDryRun) console.log('*** DRY RUN — no changes will be made ***\n');

    let ndrFixed = 0;
    let deliveredFixed = 0;
    let rtoFixed = 0;
    let alreadyCorrect = 0;
    let skipped = 0;
    let errors = 0;
    const fixedOrders = [];

    for (let i = 0; i < candidates.length; i++) {
      const order = candidates[i];
      const awb = order.delhivery_data.waybill;

      process.stdout.write(`[${i + 1}/${candidates.length}] AWB: ${awb} (${order.order_id}) ... `);

      try {
        const trackingResp = await fetchTracking(awb);

        if (!trackingResp.success || !trackingResp.data?.ShipmentData?.[0]?.Shipment?.Status) {
          console.log('SKIP (no tracking data)');
          skipped++;
          await sleep(300);
          continue;
        }

        const shipment = trackingResp.data.ShipmentData[0].Shipment;
        const latestStatus = shipment.Status;
        const correctStatus = mapStatus(latestStatus);

        // If mapping returned same status or unknown, skip
        if (!correctStatus || correctStatus === order.status) {
          console.log(`OK (${latestStatus.Status} / ${latestStatus.StatusCode} / ${latestStatus.StatusType})`);
          alreadyCorrect++;
          await sleep(300);
          continue;
        }

        const statusDateTime = latestStatus.StatusDateTime ? new Date(latestStatus.StatusDateTime) : new Date();
        const instructions = latestStatus.Instructions || '';
        const statusCode = latestStatus.StatusCode || '';
        const statusLocation = latestStatus.StatusLocation || '';

        console.log(`FIX: ${order.status} → ${correctStatus} (${statusCode}: ${instructions})`);

        if (!isDryRun) {
          const updateSet = {
            status: correctStatus
          };
          const updatePush = {
            status_history: {
              status: correctStatus,
              timestamp: new Date(),
              location: statusLocation,
              remarks: `Auto-sync fix — ${statusCode}: ${instructions}`
            }
          };

          // NDR-specific fields
          if (correctStatus === 'ndr') {
            updateSet['ndr_info.is_ndr'] = true;
            updateSet['ndr_info.ndr_attempts'] = (order.ndr_info?.ndr_attempts || 0) + 1;
            updateSet['ndr_info.last_ndr_date'] = statusDateTime;
            updateSet['ndr_info.ndr_reason'] = instructions || 'Delivery failed';
            updateSet['ndr_info.nsl_code'] = statusCode;
            updateSet['ndr_info.next_attempt_date'] = new Date(statusDateTime.getTime() + 24 * 60 * 60 * 1000);
            updateSet['ndr_info.resolution_action'] = null;
            updateSet['ndr_info.action_history'] = order.ndr_info?.action_history || [];
          }

          // Delivered-specific fields
          if (correctStatus === 'delivered') {
            updateSet.delivered_date = statusDateTime;
          }

          // RTO delivered-specific fields
          if (correctStatus === 'rto_delivered') {
            updateSet.rto_delivered_date = statusDateTime;
          }

          await db.collection('orders').updateOne(
            { _id: order._id },
            { $set: updateSet, $push: updatePush }
          );
        }

        if (correctStatus === 'ndr') ndrFixed++;
        else if (correctStatus === 'delivered') deliveredFixed++;
        else if (correctStatus.startsWith('rto')) rtoFixed++;

        fixedOrders.push({
          order_id: order.order_id,
          awb,
          old_status: order.status,
          new_status: correctStatus,
          statusCode,
          reason: instructions
        });

      } catch (err) {
        console.log(`ERROR (${err.message})`);
        errors++;
      }

      await sleep(300);
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log(isDryRun ? 'DRY RUN SUMMARY' : 'SYNC SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total checked:      ${candidates.length}`);
    console.log(`NDR fixed:          ${ndrFixed}`);
    console.log(`Delivered fixed:    ${deliveredFixed}`);
    console.log(`RTO fixed:          ${rtoFixed}`);
    console.log(`Already correct:    ${alreadyCorrect}`);
    console.log(`Skipped:            ${skipped}`);
    console.log(`Errors:             ${errors}`);

    if (fixedOrders.length > 0) {
      console.log(`\n${isDryRun ? 'Would fix' : 'Fixed'} orders:`);
      fixedOrders.forEach((o, idx) => {
        console.log(`  ${idx + 1}. ${o.order_id} (AWB: ${o.awb}) — ${o.old_status} → ${o.new_status} (${o.statusCode}: ${o.reason})`);
      });
    }

    await mongoose.disconnect();
    console.log('\nDone.');
    process.exit(0);

  } catch (err) {
    console.error('Fatal error:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixMissedStatuses();
