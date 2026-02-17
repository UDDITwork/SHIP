/**
 * Migration Script: Remittance States + RTO Status Split
 *
 * Run with: node backend/scripts/migrateRemittanceStates.js
 *
 * Changes:
 * 1. Remittance.state: pending → upcoming, completed → settled
 * 2. Order.status: rto → rto_in_transit or rto_delivered (based on latest tracking event)
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('No MongoDB URI found in environment. Set MONGODB_URI or MONGO_URI.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // --- 1. Migrate Remittance States ---
  console.log('\n--- Migrating Remittance States ---');

  const pendingResult = await db.collection('remittances').updateMany(
    { state: 'pending' },
    { $set: { state: 'upcoming' } }
  );
  console.log(`  pending → upcoming: ${pendingResult.modifiedCount} documents`);

  const completedResult = await db.collection('remittances').updateMany(
    { state: 'completed' },
    { $set: { state: 'settled' } }
  );
  console.log(`  completed → settled: ${completedResult.modifiedCount} documents`);

  // --- 2. Migrate RTO Orders ---
  console.log('\n--- Migrating RTO Orders ---');

  const rtoOrders = await db.collection('orders').find({ status: 'rto' }).toArray();
  console.log(`  Found ${rtoOrders.length} orders with status "rto"`);

  let rtoInTransitCount = 0;
  let rtoDeliveredCount = 0;

  for (const order of rtoOrders) {
    // Check tracking events for this order to determine sub-status
    const latestEvent = await db.collection('shipmenttrackingevents')
      .find({
        $or: [
          { order_id: order._id },
          { waybill: order.delhivery_data?.waybill }
        ]
      })
      .sort({ event_datetime: -1 })
      .limit(1)
      .toArray();

    let newStatus = 'rto_in_transit'; // Default to in-transit

    if (latestEvent.length > 0) {
      const event = latestEvent[0];
      const statusType = event.status_type || event.StatusType || '';
      const scanType = event.scan_type || event.ScanType || '';

      // If latest event is DL (Delivered) type with RTO context, it's rto_delivered
      if (statusType === 'DL' || scanType === 'DL') {
        newStatus = 'rto_delivered';
      }
    }

    await db.collection('orders').updateOne(
      { _id: order._id },
      { $set: { status: newStatus } }
    );

    if (newStatus === 'rto_delivered') {
      rtoDeliveredCount++;
    } else {
      rtoInTransitCount++;
    }
  }

  console.log(`  rto → rto_in_transit: ${rtoInTransitCount}`);
  console.log(`  rto → rto_delivered: ${rtoDeliveredCount}`);

  console.log('\nMigration complete!');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
