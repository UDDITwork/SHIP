/**
 * Migration Script: Create Carrier documents and link existing RateCards
 *
 * This script:
 * 1. Creates a Carrier document for existing 'DELHIVERY'
 * 2. Updates existing RateCard documents to reference the new Carrier
 * 3. Preserves all current rate data
 *
 * Run: node scripts/migrateCarriers.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Carrier = require('../models/Carrier');
const RateCard = require('../models/RateCard');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ship';

async function migrateCarriers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Step 1: Check if DELHIVERY carrier already exists
    let delhiveryCarrier = await Carrier.findByCode('DELHIVERY_SURFACE');

    if (!delhiveryCarrier) {
      console.log('Creating DELHIVERY_SURFACE carrier...');
      delhiveryCarrier = new Carrier({
        carrier_code: 'DELHIVERY_SURFACE',
        display_name: 'Delhivery Surface',
        carrier_group: 'DELHIVERY',
        service_type: 'surface',
        zone_type: 'standard',
        weight_slab_type: 'option1',
        is_active: true,
        priority_order: 1,
        description: 'Delhivery Surface Shipping - Standard delivery',
        api_config: {
          base_url: 'https://track.delhivery.com',
          api_key_required: true,
          tracking_url_template: 'https://www.delhivery.com/track/package/{awb}',
          waybill_prefix: ''
        },
        created_by: 'migration_script'
      });
      await delhiveryCarrier.save();
      console.log('DELHIVERY_SURFACE carrier created with ID:', delhiveryCarrier._id);
    } else {
      console.log('DELHIVERY_SURFACE carrier already exists with ID:', delhiveryCarrier._id);
    }

    // Step 2: Update existing RateCards to reference the carrier
    console.log('\nUpdating existing RateCards...');

    const rateCards = await RateCard.find({
      $or: [
        { carrier_id: { $exists: false } },
        { carrier_id: null }
      ]
    });

    console.log(`Found ${rateCards.length} RateCards to update`);

    let updatedCount = 0;
    for (const rateCard of rateCards) {
      rateCard.carrier_id = delhiveryCarrier._id;
      rateCard.carrier = 'DELHIVERY_SURFACE';
      rateCard.is_current = true;
      rateCard.version = rateCard.version || 1;
      rateCard.effective_from = rateCard.effective_from || rateCard.createdAt || new Date();

      await rateCard.save();
      updatedCount++;
      console.log(`  Updated RateCard: ${rateCard.userCategory}`);
    }

    console.log(`\nUpdated ${updatedCount} RateCards`);

    // Step 3: Create additional sample carriers (optional)
    const sampleCarriers = [
      {
        carrier_code: 'DELHIVERY_AIR',
        display_name: 'Delhivery Air',
        carrier_group: 'DELHIVERY',
        service_type: 'air',
        zone_type: 'standard',
        weight_slab_type: 'option1',
        is_active: false, // Inactive by default - admin needs to set up rates
        priority_order: 2,
        description: 'Delhivery Air Express - Fast delivery'
      },
      {
        carrier_code: 'DTDC_SURFACE',
        display_name: 'DTDC Surface',
        carrier_group: 'DTDC',
        service_type: 'surface',
        zone_type: 'standard',
        weight_slab_type: 'option1',
        is_active: false,
        priority_order: 3,
        description: 'DTDC Surface Shipping - Economy delivery'
      },
      {
        carrier_code: 'DTDC_AIR',
        display_name: 'DTDC Air',
        carrier_group: 'DTDC',
        service_type: 'air',
        zone_type: 'standard',
        weight_slab_type: 'option1',
        is_active: false,
        priority_order: 4,
        description: 'DTDC Air Express - Priority delivery'
      },
      {
        carrier_code: 'DTDC_PREMIUM',
        display_name: 'DTDC Premium',
        carrier_group: 'DTDC',
        service_type: 'premium',
        zone_type: 'standard',
        weight_slab_type: 'option1',
        is_active: false,
        priority_order: 5,
        description: 'DTDC Premium - Premium service with guaranteed delivery'
      }
    ];

    console.log('\nCreating sample carriers (inactive by default)...');
    for (const carrierData of sampleCarriers) {
      const existing = await Carrier.findByCode(carrierData.carrier_code);
      if (!existing) {
        const carrier = new Carrier({
          ...carrierData,
          created_by: 'migration_script'
        });
        await carrier.save();
        console.log(`  Created: ${carrierData.display_name}`);
      } else {
        console.log(`  Already exists: ${carrierData.display_name}`);
      }
    }

    // Step 4: Summary
    const totalCarriers = await Carrier.countDocuments();
    const activeCarriers = await Carrier.countDocuments({ is_active: true });
    const totalRateCards = await RateCard.countDocuments();
    const linkedRateCards = await RateCard.countDocuments({ carrier_id: { $exists: true, $ne: null } });

    console.log('\n========== Migration Summary ==========');
    console.log(`Total Carriers: ${totalCarriers}`);
    console.log(`Active Carriers: ${activeCarriers}`);
    console.log(`Total RateCards: ${totalRateCards}`);
    console.log(`Linked RateCards: ${linkedRateCards}`);
    console.log('========================================\n');

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run migration
migrateCarriers();
