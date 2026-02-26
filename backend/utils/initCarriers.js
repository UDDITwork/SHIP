/**
 * Carrier Initialization Utility
 *
 * Ensures required carriers exist on server startup.
 * Idempotent — safe to run on every restart.
 */

const Carrier = require('../models/Carrier');
const RateCard = require('../models/RateCard');
const logger = require('./logger');

async function ensureCarriersExist() {
  try {
    // 1. Ensure DELHIVERY_SURFACE exists
    let surfaceCarrier = await Carrier.findOne({ carrier_code: 'DELHIVERY_SURFACE' });
    if (!surfaceCarrier) {
      surfaceCarrier = await Carrier.create({
        carrier_code: 'DELHIVERY_SURFACE',
        display_name: 'Delhivery Surface',
        carrier_group: 'DELHIVERY',
        service_type: 'surface',
        is_active: true,
        zone_type: 'standard',
        weight_slab_type: 'option1',
        priority_order: 1,
        description: 'Delhivery Surface Shipping - Standard delivery',
        api_config: {
          base_url: 'https://track.delhivery.com',
          api_key_required: true,
          tracking_url_template: 'https://www.delhivery.com/track/package/{awb}',
          waybill_prefix: ''
        },
        created_by: 'system_init'
      });
      logger.info('Created DELHIVERY_SURFACE carrier', { id: surfaceCarrier._id });
    }

    // 2. Ensure DELHIVERY_AIR exists
    let airCarrier = await Carrier.findOne({ carrier_code: 'DELHIVERY_AIR' });
    if (!airCarrier) {
      airCarrier = await Carrier.create({
        carrier_code: 'DELHIVERY_AIR',
        display_name: 'Delhivery Air',
        carrier_group: 'DELHIVERY',
        service_type: 'air',
        is_active: true,
        zone_type: 'standard',
        weight_slab_type: 'option1',
        priority_order: 2,
        description: 'Delhivery Air Express - Fast delivery',
        api_config: {
          base_url: 'https://track.delhivery.com',
          api_key_required: true,
          tracking_url_template: 'https://www.delhivery.com/track/package/{awb}',
          waybill_prefix: ''
        },
        created_by: 'system_init'
      });
      logger.info('Created DELHIVERY_AIR carrier', { id: airCarrier._id });
    }

    // 3. Link orphaned rate cards (no carrier_id) to DELHIVERY_SURFACE
    const orphanedCount = await RateCard.countDocuments({
      $or: [
        { carrier_id: { $exists: false } },
        { carrier_id: null }
      ]
    });

    if (orphanedCount > 0) {
      const result = await RateCard.updateMany(
        {
          $or: [
            { carrier_id: { $exists: false } },
            { carrier_id: null }
          ]
        },
        {
          $set: {
            carrier_id: surfaceCarrier._id,
            carrier: 'DELHIVERY_SURFACE',
            is_current: true
          }
        }
      );
      logger.info(`Linked ${result.modifiedCount} orphaned rate cards to DELHIVERY_SURFACE`);
    }

    logger.info('Carrier initialization complete');
  } catch (error) {
    // Non-fatal — server continues even if init fails
    logger.error('Carrier initialization failed:', error);
  }
}

module.exports = { ensureCarriersExist };
