// Seed script to add Delhivery Surface carrier document and link existing rate cards
// Run this once: node backend/scripts/seedDelhiverySurface.js

const path = require('path');
const mongoose = require('mongoose');
const Carrier = require('../models/Carrier');
const RateCard = require('../models/RateCard');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ZONE_DEFINITIONS = [
  { zone: "Zone A", definition: "Local within city pickup and delivery." },
  { zone: "Zone B", definition: "Origin to destination within 500 kms Regional." },
  { zone: "Zone C (Metro to Metro)", definition: "Origin to destination between 501 - 2500 kms (Metro to Metro only)." },
  { zone: "Zone D (Rest of India)", definition: "Origin to destination between 501 - 2500 kms (Rest of India only)." },
  { zone: "Zone E & F (Special)", definition: "NE, J&K and origin to destination >2500 kms" }
];

const TERMS_AND_CONDITIONS = [
  "Above Shared Commercials are Inclusive GST.",
  "Above pricing subject to change based on courier company updation or change in any commercials.",
  "Freight Weight is Picked - Volumetric or Dead weight whichever is higher will be charged.",
  "Other charges like address correction charges if applicable shall be charged extra.",
  "Prohibited item not to be ship, if any penalty will charge to seller.",
  "No Claim would be entertained for Glassware, Fragile products.",
  "Any weight dispute due to incorrect weight declaration cannot be claimed.",
  "Chargeable weight would be volumetric or actual weight, whichever is higher (LxBxH/5000).",
  "Liability maximum limit INR 2000 or product value whichever is lower."
];

// Surface rate cards (same as seedRateCards.js data)
const DELHIVERY_SURFACE_RATE_CARDS = [
  {
    userCategory: "New User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 36, B: 42, C: 43, D: 46, E: 56, F: 62 } },
      { condition: "250-500 gm", zones: { A: 6, B: 8, C: 12, D: 13, E: 13, F: 14 } },
      { condition: "Upto 5kgs", zones: { A: 135, B: 188, C: 263, D: 278, E: 337, F: 375 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 10, B: 17, C: 28, D: 32, E: 40, F: 44 } },
      { condition: "Upto 10 kgs", zones: { A: 221, B: 277, C: 387, D: 411, E: 498, F: 554 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 27, B: 30, C: 39, D: 46, E: 55, F: 65 } },
      { condition: "Add. 1 kgs", zones: { A: 19, B: 23, C: 29, D: 33, E: 46, F: 48 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 43, B: 51, C: 52, D: 55, E: 68, F: 75 } },
      { condition: "DTO 250-500 gm", zones: { A: 7, B: 7, C: 14, D: 14, E: 16, F: 17 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 12, B: 20, C: 36, D: 42, E: 51, F: 55 } },
      { condition: "DTO Upto 5kgs", zones: { A: 156, B: 217, C: 302, D: 321, E: 389, F: 432 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 33, B: 36, C: 46, D: 55, E: 66, F: 78 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 254, B: 319, C: 300, D: 474, E: 573, F: 638 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 23, B: 27, C: 35, D: 40, E: 55, F: 58 } }
    ],
    codCharges: { percentage: 1.8, minimumAmount: 45, gstAdditional: true }
  },
  {
    userCategory: "Basic User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 33, B: 38, C: 40, D: 42, E: 52, F: 57 } },
      { condition: "250-500 gm", zones: { A: 5, B: 5, C: 11, D: 11, E: 12, F: 13 } },
      { condition: "Upto 5kgs", zones: { A: 119, B: 165, C: 232, D: 245, E: 297, F: 330 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 9, B: 16, C: 28, D: 32, E: 38, F: 42 } },
      { condition: "Upto 10 kgs", zones: { A: 195, B: 244, C: 340, D: 361, E: 438, F: 487 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 25, B: 28, C: 36, D: 42, E: 50, F: 60 } },
      { condition: "Add. 1 kgs", zones: { A: 17, B: 21, C: 26, D: 30, E: 42, F: 44 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 40, B: 46, C: 48, D: 50, E: 62, F: 69 } },
      { condition: "DTO 250-500 gm", zones: { A: 7, B: 7, C: 13, D: 13, E: 15, F: 16 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 11, B: 19, C: 33, D: 38, E: 46, F: 50 } },
      { condition: "DTO Upto 5kgs", zones: { A: 143, B: 199, C: 277, D: 294, E: 356, F: 396 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 30, B: 33, C: 42, D: 50, E: 61, F: 71 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 233, B: 293, C: 275, D: 434, E: 526, F: 585 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 21, B: 25, C: 32, D: 37, E: 50, F: 53 } }
    ],
    codCharges: { percentage: 1.5, minimumAmount: 35, gstAdditional: true }
  },
  {
    userCategory: "Lite User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 34, B: 39, C: 42, D: 44, E: 53, F: 59 } },
      { condition: "250-500 gm", zones: { A: 6, B: 6, C: 11, D: 11, E: 12, F: 14 } },
      { condition: "Upto 5kgs", zones: { A: 125, B: 173, C: 242, D: 256, E: 310, F: 345 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 10, B: 17, C: 28, D: 32, E: 39, F: 44 } },
      { condition: "Upto 10 kgs", zones: { A: 203, B: 255, C: 356, D: 378, E: 458, F: 509 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 26, B: 29, C: 37, D: 44, E: 53, F: 62 } },
      { condition: "Add. 1 kgs", zones: { A: 18, B: 22, C: 28, D: 32, E: 44, F: 46 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 42, B: 48, C: 50, D: 53, E: 65, F: 72 } },
      { condition: "DTO 250-500 gm", zones: { A: 7, B: 7, C: 14, D: 14, E: 15, F: 17 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 11, B: 19, C: 35, D: 40, E: 48, F: 53 } },
      { condition: "DTO Upto 5kgs", zones: { A: 149, B: 208, C: 289, D: 307, E: 372, F: 414 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 32, B: 35, C: 44, D: 53, E: 64, F: 75 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 244, B: 306, C: 288, D: 454, E: 550, F: 612 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 22, B: 26, C: 33, D: 39, E: 53, F: 55 } }
    ],
    codCharges: { percentage: 1.8, minimumAmount: 40, gstAdditional: true }
  },
  {
    userCategory: "Advanced",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 32, B: 37, C: 38, D: 40, E: 49, F: 54 } },
      { condition: "250-500 gm", zones: { A: 5, B: 5, C: 10, D: 10, E: 11, F: 13 } },
      { condition: "Upto 5kgs", zones: { A: 114, B: 158, C: 221, D: 234, E: 283, F: 315 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 9, B: 15, C: 27, D: 30, E: 37, F: 40 } },
      { condition: "Upto 10 kgs", zones: { A: 186, B: 233, C: 325, D: 345, E: 418, F: 465 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 24, B: 27, C: 34, D: 40, E: 48, F: 57 } },
      { condition: "Add. 1 kgs", zones: { A: 16, B: 20, C: 25, D: 29, E: 40, F: 42 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 38, B: 44, C: 45, D: 48, E: 59, F: 66 } },
      { condition: "DTO 250-500 gm", zones: { A: 6, B: 6, C: 13, D: 13, E: 14, F: 15 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 10, B: 18, C: 32, D: 37, E: 44, F: 48 } },
      { condition: "DTO Upto 5kgs", zones: { A: 136, B: 190, C: 264, D: 281, E: 340, F: 378 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 29, B: 32, C: 40, D: 48, E: 58, F: 68 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 222, B: 279, C: 263, D: 415, E: 502, F: 559 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 20, B: 24, C: 30, D: 35, E: 48, F: 51 } }
    ],
    codCharges: { percentage: 1.25, minimumAmount: 25, gstAdditional: true }
  }
];

async function seedDelhiverySurface() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      console.error('❌ MONGODB_URI or MONGO_URI environment variable is not set');
      console.error('Please set MONGODB_URI in your backend/.env file');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Step 1: Create or find Delhivery Surface carrier
    console.log('\n📦 Creating Delhivery Surface carrier...');
    let surfaceCarrier = await Carrier.findOne({ carrier_code: 'DELHIVERY_SURFACE' });

    if (surfaceCarrier) {
      console.log('   ℹ️  Delhivery Surface carrier already exists');
    } else {
      surfaceCarrier = await Carrier.create({
        carrier_code: 'DELHIVERY_SURFACE',
        display_name: 'Delhivery Surface',
        carrier_group: 'DELHIVERY',
        service_type: 'surface',
        is_active: true,
        zone_type: 'standard',
        weight_slab_type: 'option1',
        priority_order: 1,
        description: 'Delhivery Surface Service - standard delivery',
        api_config: {
          base_url: '',
          api_key_required: true,
          tracking_url_template: '',
          waybill_prefix: ''
        },
        created_by: 'system'
      });
      console.log('   ✅ Created Delhivery Surface carrier');
    }

    // Step 2: Link existing legacy rate cards (carrier: 'DELHIVERY', no carrier_id) to this carrier
    console.log('\n🔗 Linking legacy rate cards to Delhivery Surface carrier...');
    const legacyUpdateResult = await RateCard.updateMany(
      { carrier: 'DELHIVERY', carrier_id: { $exists: false } },
      { $set: { carrier_id: surfaceCarrier._id, is_current: true } }
    );
    console.log(`   ✅ Linked ${legacyUpdateResult.modifiedCount} legacy rate cards`);

    // Step 3: Check if carrier-linked rate cards already exist
    const existingSurfaceRateCards = await RateCard.find({
      carrier_id: surfaceCarrier._id,
      is_current: true
    });

    if (existingSurfaceRateCards.length >= 4) {
      console.log(`\n✅ ${existingSurfaceRateCards.length} rate cards already linked to Delhivery Surface`);
    } else {
      // Create new rate cards for any missing categories
      const existingCategories = existingSurfaceRateCards.map(rc => rc.userCategory);
      const missingCards = DELHIVERY_SURFACE_RATE_CARDS.filter(
        rc => !existingCategories.includes(rc.userCategory)
      );

      if (missingCards.length > 0) {
        console.log(`\n💳 Creating ${missingCards.length} missing Surface rate cards...`);
        const rateCardsToInsert = missingCards.map(rateCard => ({
          ...rateCard,
          carrier: 'DELHIVERY',
          carrier_id: surfaceCarrier._id,
          is_current: true,
          version: 1,
          effective_from: new Date(),
          effective_to: null,
          zoneDefinitions: ZONE_DEFINITIONS,
          termsAndConditions: TERMS_AND_CONDITIONS
        }));

        const insertedRateCards = await RateCard.insertMany(rateCardsToInsert);
        console.log(`   ✅ Created ${insertedRateCards.length} rate cards:`);
        insertedRateCards.forEach(rc => console.log(`      - ${rc.userCategory}`));
      }
    }

    // Summary
    const finalCount = await RateCard.countDocuments({ carrier_id: surfaceCarrier._id, is_current: true });
    console.log('\n✨ Summary:');
    console.log(`   - Carrier: ${surfaceCarrier.display_name} (${surfaceCarrier.carrier_code})`);
    console.log(`   - Service Type: ${surfaceCarrier.service_type}`);
    console.log(`   - Rate Cards: ${finalCount} categories`);
    console.log(`   - Status: ${surfaceCarrier.is_active ? 'Active' : 'Inactive'}`);

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    console.log('🎉 Delhivery Surface setup complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding Delhivery Surface:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedDelhiverySurface();
