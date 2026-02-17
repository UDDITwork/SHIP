// Seed script to add Delhivery Air carrier and rate cards
// Run this once: node backend/scripts/seedDelhiveryAir.js

const path = require('path');
const mongoose = require('mongoose');
const Carrier = require('../models/Carrier');
const RateCard = require('../models/RateCard');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Zone definitions (same as Surface)
const ZONE_DEFINITIONS = [
  { zone: "Zone A", definition: "Local within city pickup and delivery." },
  { zone: "Zone B", definition: "Origin to destination within 500 kms Regional." },
  { zone: "Zone C (Metro to Metro)", definition: "Origin to destination between 501 - 2500 kms (Metro to Metro only)." },
  { zone: "Zone D (Rest of India)", definition: "Origin to destination between 501 - 2500 kms (Rest of India only)." },
  { zone: "Zone E & F (Special)", definition: "NE, J&K and origin to destination >2500 kms" }
];

// Terms and Conditions (same as Surface)
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

// ===================================================================
// TODO: REPLACE THESE WITH ACTUAL DELHIVERY AIR RATES FROM WHATSAPP
// ===================================================================
// Air rates should be HIGHER than Surface rates for faster delivery
// Same structure: 0-250gm, 250-500gm, Add 500gm till 5kg, etc.
const DELHIVERY_AIR_RATE_CARDS = [
  {
    userCategory: "New User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 45, B: 52, C: 54, D: 57, E: 70, F: 77 } },
      { condition: "250-500 gm", zones: { A: 8, B: 10, C: 15, D: 16, E: 16, F: 17 } },
      { condition: "Upto 5kgs", zones: { A: 169, B: 235, C: 329, D: 348, E: 421, F: 469 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 13, B: 21, C: 35, D: 40, E: 50, F: 55 } },
      { condition: "Upto 10 kgs", zones: { A: 276, B: 346, C: 484, D: 514, E: 623, F: 693 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 34, B: 38, C: 49, D: 58, E: 69, F: 81 } },
      { condition: "Add. 1 kgs", zones: { A: 24, B: 29, C: 36, D: 41, E: 58, F: 60 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 54, B: 64, C: 65, D: 69, E: 85, F: 94 } },
      { condition: "DTO 250-500 gm", zones: { A: 9, B: 9, C: 18, D: 18, E: 20, F: 21 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 15, B: 25, C: 45, D: 53, E: 64, F: 69 } },
      { condition: "DTO Upto 5kgs", zones: { A: 195, B: 271, C: 378, D: 401, E: 486, F: 540 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 41, B: 45, C: 58, D: 69, E: 83, F: 98 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 318, B: 399, C: 375, D: 593, E: 716, F: 798 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 29, B: 34, C: 44, D: 50, E: 69, F: 73 } }
    ],
    codCharges: { percentage: 1.8, minimumAmount: 45, gstAdditional: true }
  },
  {
    userCategory: "Basic User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 41, B: 48, C: 50, D: 53, E: 65, F: 71 } },
      { condition: "250-500 gm", zones: { A: 6, B: 6, C: 14, D: 14, E: 15, F: 16 } },
      { condition: "Upto 5kgs", zones: { A: 149, B: 206, C: 290, D: 306, E: 371, F: 413 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 11, B: 20, C: 35, D: 40, E: 48, F: 53 } },
      { condition: "Upto 10 kgs", zones: { A: 244, B: 305, C: 425, D: 451, E: 548, F: 609 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 31, B: 35, C: 45, D: 53, E: 63, F: 75 } },
      { condition: "Add. 1 kgs", zones: { A: 21, B: 26, C: 33, D: 38, E: 53, F: 55 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 50, B: 58, C: 60, D: 63, E: 78, F: 86 } },
      { condition: "DTO 250-500 gm", zones: { A: 9, B: 9, C: 16, D: 16, E: 19, F: 20 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 14, B: 24, C: 41, D: 48, E: 58, F: 63 } },
      { condition: "DTO Upto 5kgs", zones: { A: 179, B: 249, C: 346, D: 368, E: 445, F: 495 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 38, B: 41, C: 53, D: 63, E: 76, F: 89 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 291, B: 366, C: 344, D: 543, E: 658, F: 731 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 26, B: 31, C: 40, D: 46, E: 63, F: 66 } }
    ],
    codCharges: { percentage: 1.5, minimumAmount: 35, gstAdditional: true }
  },
  {
    userCategory: "Lite User",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 43, B: 49, C: 53, D: 55, E: 66, F: 74 } },
      { condition: "250-500 gm", zones: { A: 8, B: 8, C: 14, D: 14, E: 15, F: 18 } },
      { condition: "Upto 5kgs", zones: { A: 156, B: 216, C: 303, D: 320, E: 388, F: 431 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 13, B: 21, C: 35, D: 40, E: 49, F: 55 } },
      { condition: "Upto 10 kgs", zones: { A: 254, B: 319, C: 445, D: 473, E: 573, F: 636 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 33, B: 36, C: 46, D: 55, E: 66, F: 78 } },
      { condition: "Add. 1 kgs", zones: { A: 23, B: 28, C: 35, D: 40, E: 55, F: 58 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 53, B: 60, C: 63, D: 66, E: 81, F: 90 } },
      { condition: "DTO 250-500 gm", zones: { A: 9, B: 9, C: 18, D: 18, E: 19, F: 21 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 14, B: 24, C: 44, D: 50, E: 60, F: 66 } },
      { condition: "DTO Upto 5kgs", zones: { A: 186, B: 260, C: 361, D: 384, E: 465, F: 518 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 40, B: 44, C: 55, D: 66, E: 80, F: 94 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 305, B: 383, C: 360, D: 568, E: 688, F: 765 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 28, B: 33, C: 41, D: 49, E: 66, F: 69 } }
    ],
    codCharges: { percentage: 1.8, minimumAmount: 40, gstAdditional: true }
  },
  {
    userCategory: "Advanced",
    forwardCharges: [
      { condition: "0-250 gm", zones: { A: 40, B: 46, C: 48, D: 50, E: 61, F: 68 } },
      { condition: "250-500 gm", zones: { A: 6, B: 6, C: 13, D: 13, E: 14, F: 16 } },
      { condition: "Upto 5kgs", zones: { A: 143, B: 198, C: 276, D: 293, E: 354, F: 394 } },
      { condition: "Add. 500 gm till 5kg", zones: { A: 11, B: 19, C: 34, D: 38, E: 46, F: 50 } },
      { condition: "Upto 10 kgs", zones: { A: 233, B: 291, C: 406, D: 431, E: 523, F: 581 } },
      { condition: "Add. 1 kgs till 10kg", zones: { A: 30, B: 34, C: 43, D: 50, E: 60, F: 71 } },
      { condition: "Add. 1 kgs", zones: { A: 20, B: 25, C: 31, D: 36, E: 50, F: 53 } }
    ],
    rtoCharges: [
      { condition: "DTO 0-250 gm", zones: { A: 48, B: 55, C: 56, D: 60, E: 74, F: 83 } },
      { condition: "DTO 250-500 gm", zones: { A: 8, B: 8, C: 16, D: 16, E: 18, F: 19 } },
      { condition: "DTO Add. 500 gm till 5kg", zones: { A: 13, B: 23, C: 40, D: 46, E: 55, F: 60 } },
      { condition: "DTO Upto 5kgs", zones: { A: 170, B: 238, C: 330, D: 351, E: 425, F: 473 } },
      { condition: "DTO Add. 1 kgs till 10k", zones: { A: 36, B: 40, C: 50, D: 60, E: 73, F: 85 } },
      { condition: "DTO Upto 10 kgs", zones: { A: 278, B: 349, C: 329, D: 519, E: 628, F: 699 } },
      { condition: "DTO Add. 1 kgs", zones: { A: 25, B: 30, C: 38, D: 44, E: 60, F: 64 } }
    ],
    codCharges: { percentage: 1.25, minimumAmount: 25, gstAdditional: true }
  }
];

async function seedDelhiveryAir() {
  try {
    // Connect to MongoDB
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

    // Step 1: Create or find Delhivery Air carrier
    console.log('\n📦 Creating Delhivery Air carrier...');
    let airCarrier = await Carrier.findOne({ carrier_code: 'DELHIVERY_AIR' });

    if (airCarrier) {
      console.log('   ℹ️  Delhivery Air carrier already exists');
    } else {
      airCarrier = await Carrier.create({
        carrier_code: 'DELHIVERY_AIR',
        display_name: 'Delhivery Air',
        carrier_group: 'DELHIVERY',
        service_type: 'air',
        is_active: true,
        zone_type: 'standard',
        weight_slab_type: 'option1',
        priority_order: 2,
        description: 'Delhivery Air Express Service for faster delivery',
        api_config: {
          base_url: '',
          api_key_required: true,
          tracking_url_template: '',
          waybill_prefix: ''
        },
        created_by: 'system'
      });
      console.log('   ✅ Created Delhivery Air carrier');
    }

    // Step 2: Check if Air rate cards already exist
    const existingAirRateCards = await RateCard.find({ carrier_id: airCarrier._id });
    if (existingAirRateCards.length > 0) {
      console.log('\n⚠️  Delhivery Air rate cards already exist. Deleting old ones...');
      await RateCard.deleteMany({ carrier_id: airCarrier._id });
      console.log('   ✅ Deleted existing Air rate cards');
    }

    // Step 3: Create rate cards for Delhivery Air
    console.log('\n💳 Creating Delhivery Air rate cards...');
    const rateCardsToInsert = DELHIVERY_AIR_RATE_CARDS.map(rateCard => ({
      ...rateCard,
      carrier: 'DELHIVERY', // Legacy field
      carrier_id: airCarrier._id, // New reference
      is_current: true,
      version: 1,
      effective_from: new Date(),
      effective_to: null,
      zoneDefinitions: ZONE_DEFINITIONS,
      termsAndConditions: TERMS_AND_CONDITIONS
    }));

    const insertedRateCards = await RateCard.insertMany(rateCardsToInsert);
    console.log(`   ✅ Successfully created ${insertedRateCards.length} Air rate cards:`);
    insertedRateCards.forEach(rc => {
      console.log(`      - ${rc.userCategory}`);
    });

    // Summary
    console.log('\n✨ Summary:');
    console.log(`   - Carrier: ${airCarrier.display_name} (${airCarrier.carrier_code})`);
    console.log(`   - Service Type: ${airCarrier.service_type}`);
    console.log(`   - Rate Cards: ${insertedRateCards.length} categories`);
    console.log(`   - Status: ${airCarrier.is_active ? 'Active' : 'Inactive'}`);

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    console.log('🎉 Delhivery Air setup complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding Delhivery Air:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedDelhiveryAir();
