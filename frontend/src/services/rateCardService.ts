// Rate Card Service for managing shipping charges based on user categories
import { apiService } from './api';

export interface ZoneDefinition {
  zone: string;
  definition: string;
}

export interface WeightSlab {
  condition: string;
  zones: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    F: number;
  };
}

export interface RateCard {
  userCategory: string;
  carrier: string;
  forwardCharges: WeightSlab[];
  rtoCharges: WeightSlab[];
  codCharges: {
    percentage: number;
    minimumAmount: number;
    gstAdditional: boolean;
  };
  zoneDefinitions: ZoneDefinition[];
  termsAndConditions: string[];
}

// Zone definitions
export const ZONE_DEFINITIONS: ZoneDefinition[] = [
  { zone: "Zone A", definition: "Local within city pickup and delivery." },
  { zone: "Zone B", definition: "Origin to destination within 500 kms Regional." },
  { zone: "Zone C (Metro to Metro)", definition: "Origin to destination between 501 - 2500 kms (Metro to Metro only)." },
  { zone: "Zone D (Rest of India)", definition: "Origin to destination between 501 - 2500 kms (Rest of India only)." },
  { zone: "Zone E & F (Special)", definition: "NE, J&K and origin to destination >2500 kms" }
];

// Terms and Conditions
export const TERMS_AND_CONDITIONS = [
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

// NEW USER Rate Card Data
export const NEW_USER_RATE_CARD: RateCard = {
  userCategory: "New User",
  carrier: "DELHIVERY",
  forwardCharges: [
    {
      condition: "0-250 gm",
      zones: { A: 36, B: 42, C: 43, D: 46, E: 56, F: 62 }
    },
    {
      condition: "250-500 gm",
      zones: { A: 6, B: 8, C: 12, D: 13, E: 13, F: 14 }
    },
    {
      condition: "Add. 500 gm till 5kg",
      zones: { A: 10, B: 17, C: 28, D: 32, E: 40, F: 44 }
    },
    {
      condition: "Upto 5kgs",
      zones: { A: 135, B: 188, C: 263, D: 278, E: 337, F: 375 }
    },
    {
      condition: "Add. 1 kgs till 10kg",
      zones: { A: 27, B: 30, C: 39, D: 46, E: 55, F: 65 }
    },
    {
      condition: "Upto 10 kgs",
      zones: { A: 221, B: 277, C: 387, D: 411, E: 498, F: 554 }
    },
    {
      condition: "Add. 1 kgs",
      zones: { A: 19, B: 23, C: 29, D: 33, E: 46, F: 48 }
    }
  ],
  rtoCharges: [
    {
      condition: "DTO 0-250 gm",
      zones: { A: 43, B: 51, C: 52, D: 55, E: 68, F: 75 }
    },
    {
      condition: "DTO 250-500 gm",
      zones: { A: 7, B: 7, C: 14, D: 14, E: 16, F: 17 }
    },
    {
      condition: "DTO Add. 500 gm till 5kg",
      zones: { A: 12, B: 20, C: 36, D: 42, E: 51, F: 55 }
    },
    {
      condition: "DTO Upto 5kgs",
      zones: { A: 156, B: 217, C: 302, D: 321, E: 389, F: 432 }
    },
    {
      condition: "DTO Add. 1 kgs till 10k",
      zones: { A: 33, B: 36, C: 46, D: 55, E: 66, F: 78 }
    },
    {
      condition: "DTO Upto 10 kgs",
      zones: { A: 254, B: 319, C: 300, D: 474, E: 573, F: 638 }
    },
    {
      condition: "DTO Add. 1 kgs",
      zones: { A: 23, B: 27, C: 35, D: 40, E: 55, F: 58 }
    }
  ],
  codCharges: {
    percentage: 1.8,
    minimumAmount: 45,
    gstAdditional: true
  },
  zoneDefinitions: ZONE_DEFINITIONS,
  termsAndConditions: TERMS_AND_CONDITIONS
};

// BASIC USER Rate Card Data (1000-2500 shipments/month)
export const BASIC_USER_RATE_CARD: RateCard = {
  userCategory: "Basic User",
  carrier: "DELHIVERY",
  forwardCharges: [
    {
      condition: "0-250 gm",
      zones: { A: 33, B: 38, C: 40, D: 42, E: 52, F: 57 }
    },
    {
      condition: "250-500 gm",
      zones: { A: 5, B: 5, C: 11, D: 11, E: 12, F: 13 }
    },
    {
      condition: "Add. 500 gm till 5kg",
      zones: { A: 9, B: 16, C: 28, D: 32, E: 38, F: 42 }
    },
    {
      condition: "Upto 5kgs",
      zones: { A: 119, B: 165, C: 232, D: 245, E: 297, F: 330 }
    },
    {
      condition: "Add. 1 kgs till 10kg",
      zones: { A: 25, B: 28, C: 36, D: 42, E: 50, F: 60 }
    },
    {
      condition: "Upto 10 kgs",
      zones: { A: 195, B: 244, C: 340, D: 361, E: 438, F: 487 }
    },
    {
      condition: "Add. 1 kgs",
      zones: { A: 17, B: 21, C: 26, D: 30, E: 42, F: 44 }
    }
  ],
  rtoCharges: [
    {
      condition: "DTO 0-250 gm",
      zones: { A: 40, B: 46, C: 48, D: 50, E: 62, F: 69 }
    },
    {
      condition: "DTO 250-500 gm",
      zones: { A: 7, B: 7, C: 13, D: 13, E: 15, F: 16 }
    },
    {
      condition: "DTO Add. 500 gm till 5kg",
      zones: { A: 11, B: 19, C: 33, D: 38, E: 46, F: 50 }
    },
    {
      condition: "DTO Upto 5kgs",
      zones: { A: 143, B: 199, C: 277, D: 294, E: 356, F: 396 }
    },
    {
      condition: "DTO Add. 1 kgs till 10k",
      zones: { A: 30, B: 33, C: 42, D: 50, E: 61, F: 71 }
    },
    {
      condition: "DTO Upto 10 kgs",
      zones: { A: 233, B: 293, C: 275, D: 434, E: 526, F: 585 }
    },
    {
      condition: "DTO Add. 1 kgs",
      zones: { A: 21, B: 25, C: 32, D: 37, E: 50, F: 53 }
    }
  ],
  codCharges: {
    percentage: 1.5,
    minimumAmount: 35,
    gstAdditional: true
  },
  zoneDefinitions: ZONE_DEFINITIONS,
  termsAndConditions: TERMS_AND_CONDITIONS
};

// ADVANCED USER Rate Card Data (3000-5000 shipments/month)
export const ADVANCED_USER_RATE_CARD: RateCard = {
  userCategory: "Advanced",
  carrier: "DELHIVERY",
  forwardCharges: [
    {
      condition: "0-250 gm",
      zones: { A: 32, B: 37, C: 38, D: 40, E: 49, F: 54 }
    },
    {
      condition: "250-500 gm",
      zones: { A: 5, B: 5, C: 10, D: 10, E: 11, F: 13 }
    },
    {
      condition: "Add. 500 gm till 5kg",
      zones: { A: 9, B: 15, C: 27, D: 30, E: 37, F: 40 }
    },
    {
      condition: "Upto 5kgs",
      zones: { A: 114, B: 158, C: 221, D: 234, E: 283, F: 315 }
    },
    {
      condition: "Add. 1 kgs till 10kg",
      zones: { A: 24, B: 27, C: 34, D: 40, E: 48, F: 57 }
    },
    {
      condition: "Upto 10 kgs",
      zones: { A: 186, B: 233, C: 325, D: 345, E: 418, F: 465 }
    },
    {
      condition: "Add. 1 kgs",
      zones: { A: 16, B: 20, C: 25, D: 29, E: 40, F: 42 }
    }
  ],
  rtoCharges: [
    {
      condition: "DTO 0-250 gm",
      zones: { A: 38, B: 44, C: 45, D: 48, E: 59, F: 66 }
    },
    {
      condition: "DTO 250-500 gm",
      zones: { A: 6, B: 6, C: 13, D: 13, E: 14, F: 15 }
    },
    {
      condition: "DTO Add. 500 gm till 5kg",
      zones: { A: 10, B: 18, C: 32, D: 37, E: 44, F: 48 }
    },
    {
      condition: "DTO Upto 5kgs",
      zones: { A: 136, B: 190, C: 264, D: 281, E: 340, F: 378 }
    },
    {
      condition: "DTO Add. 1 kgs till 10k",
      zones: { A: 29, B: 32, C: 40, D: 48, E: 58, F: 68 }
    },
    {
      condition: "DTO Upto 10 kgs",
      zones: { A: 222, B: 279, C: 263, D: 415, E: 502, F: 559 }
    },
    {
      condition: "DTO Add. 1 kgs",
      zones: { A: 20, B: 24, C: 30, D: 35, E: 48, F: 51 }
    }
  ],
  codCharges: {
    percentage: 1.25,
    minimumAmount: 25,
    gstAdditional: true
  },
  zoneDefinitions: ZONE_DEFINITIONS,
  termsAndConditions: TERMS_AND_CONDITIONS
};

// LITE USER Rate Card Data (1000 shipment/month)
export const LITE_USER_RATE_CARD: RateCard = {
  userCategory: "Lite User",
  carrier: "DELHIVERY",
  forwardCharges: [
    {
      condition: "0-250 gm",
      zones: { A: 34, B: 39, C: 42, D: 44, E: 53, F: 59 }
    },
    {
      condition: "250-500 gm",
      zones: { A: 6, B: 6, C: 11, D: 11, E: 12, F: 14 }
    },
    {
      condition: "Add. 500 gm till 5kg",
      zones: { A: 10, B: 17, C: 28, D: 32, E: 39, F: 44 }
    },
    {
      condition: "Upto 5kgs",
      zones: { A: 125, B: 173, C: 242, D: 256, E: 310, F: 345 }
    },
    {
      condition: "Add. 1 kgs till 10kg",
      zones: { A: 26, B: 29, C: 37, D: 44, E: 53, F: 62 }
    },
    {
      condition: "Upto 10 kgs",
      zones: { A: 203, B: 255, C: 356, D: 378, E: 458, F: 509 }
    },
    {
      condition: "Add. 1 kgs",
      zones: { A: 18, B: 22, C: 28, D: 32, E: 44, F: 46 }
    }
  ],
  rtoCharges: [
    {
      condition: "DTO 0-250 gm",
      zones: { A: 42, B: 48, C: 50, D: 53, E: 65, F: 72 }
    },
    {
      condition: "DTO 250-500 gm",
      zones: { A: 7, B: 7, C: 14, D: 14, E: 15, F: 17 }
    },
    {
      condition: "DTO Add. 500 gm till 5kg",
      zones: { A: 11, B: 19, C: 35, D: 40, E: 48, F: 53 }
    },
    {
      condition: "DTO Upto 5kgs",
      zones: { A: 149, B: 208, C: 289, D: 307, E: 372, F: 414 }
    },
    {
      condition: "DTO Add. 1 kgs till 10k",
      zones: { A: 32, B: 35, C: 44, D: 53, E: 64, F: 75 }
    },
    {
      condition: "DTO Upto 10 kgs",
      zones: { A: 244, B: 306, C: 288, D: 454, E: 550, F: 612 }
    },
    {
      condition: "DTO Add. 1 kgs",
      zones: { A: 22, B: 26, C: 33, D: 39, E: 53, F: 55 }
    }
  ],
  codCharges: {
    percentage: 1.8,
    minimumAmount: 40,
    gstAdditional: true
  },
  zoneDefinitions: ZONE_DEFINITIONS,
  termsAndConditions: TERMS_AND_CONDITIONS
};

// Rate card storage - can be expanded for other user categories
// NOTE: Hardcoded ratecards are kept as fallback, but primary source is now API
export const RATE_CARDS: { [key: string]: RateCard } = {
  "New User": NEW_USER_RATE_CARD,
  "Basic User": BASIC_USER_RATE_CARD,
  "Lite User": LITE_USER_RATE_CARD,
  "Advanced": ADVANCED_USER_RATE_CARD,
  "Advanced User": ADVANCED_USER_RATE_CARD  // Alias for "Advanced"
};

export class RateCardService {
  // Get rate card for a specific user category (from API)
  static async getRateCard(userCategory: string): Promise<RateCard | null> {
    try {
      // Normalize category name for API
      let normalizedCategory = userCategory;
      if (userCategory === 'Advanced User') {
        normalizedCategory = 'Advanced';
      }
      
      const response = await apiService.get<{ success: boolean; data: RateCard }>(
        `/shipping/rate-card/${encodeURIComponent(normalizedCategory)}`
      );
      
      if (response.success && response.data) {
        return response.data;
      }
      
      // Fallback to hardcoded data if API fails
      console.warn('API ratecard fetch failed, using fallback data');
      return RATE_CARDS[userCategory] || null;
    } catch (error) {
      console.error('Error fetching ratecard from API:', error);
      // Fallback to hardcoded data
      return RATE_CARDS[userCategory] || null;
    }
  }

  // Calculate shipping charges based on weight, dimensions, and zone
  static async calculateShippingCharges(
    userCategory: string,
    weight: number, // in grams
    dimensions: { length: number; breadth: number; height: number }, // in cm
    zone: string,
    codAmount?: number,
    orderType: 'forward' | 'rto' = 'forward'
  ): Promise<{
    forwardCharges: number;
    rtoCharges: number;
    codCharges: number;
    totalCharges: number;
    volumetricWeight: number;
    chargeableWeight: number;
  }> {
    const rateCard = await this.getRateCard(userCategory);
    if (!rateCard) {
      throw new Error(`Rate card not found for user category: ${userCategory}`);
    }

    // Calculate volumetric weight (LxBxH/5000)
    const volumetricWeight = (dimensions.length * dimensions.breadth * dimensions.height) / 5000;
    
    // Use higher of actual weight or volumetric weight
    const chargeableWeight = Math.max(weight, volumetricWeight);

    // Calculate forward charges
    const forwardCharges = this.calculateForwardCharges(rateCard, chargeableWeight, zone);
    
    // Calculate RTO charges
    const rtoCharges = this.calculateRTOCharges(rateCard, chargeableWeight, zone);
    
    // Calculate COD charges if COD amount is provided
    let codCharges = 0;
    if (codAmount && codAmount > 0) {
      const codPercentage = (codAmount * rateCard.codCharges.percentage) / 100;
      codCharges = Math.max(codPercentage, rateCard.codCharges.minimumAmount);
      if (rateCard.codCharges.gstAdditional) {
        codCharges = codCharges * 1.18; // Adding 18% GST
      }
    }

    // Calculate total based on order type
    let totalCharges;
    if (orderType === 'forward') {
      totalCharges = forwardCharges + codCharges;
    } else if (orderType === 'rto') {
      totalCharges = rtoCharges + codCharges;
    } else {
      totalCharges = forwardCharges + codCharges;
    }

    return {
      forwardCharges,
      rtoCharges,
      codCharges,
      totalCharges,
      volumetricWeight,
      chargeableWeight
    };
  }

  private static calculateForwardCharges(rateCard: RateCard, weight: number, zone: string): number {
    const zoneKey = this.getZoneKey(zone);
    if (!zoneKey) return 0;

    // Find all required slabs
    const baseSlab = rateCard.forwardCharges.find(s => s.condition === "0-250 gm");
    const slab250_500 = rateCard.forwardCharges.find(s => s.condition === "250-500 gm");
    const slabAdd500gm = rateCard.forwardCharges.find(s => s.condition === "Add. 500 gm till 5kg");
    const slabUpto5kg = rateCard.forwardCharges.find(s => s.condition === "Upto 5kgs");
    const slabAdd1kgTill10 = rateCard.forwardCharges.find(s => s.condition === "Add. 1 kgs till 10kg");
    const slabUpto10kg = rateCard.forwardCharges.find(s => s.condition === "Upto 10 kgs");
    const slabAdd1kg = rateCard.forwardCharges.find(s => s.condition === "Add. 1 kgs");

    if (!baseSlab) return 0;

    let totalCharges = 0;
    const weightInGrams = weight;

    // 1. First 250 grams (0-250 gm) - Base charge
    if (weightInGrams <= 250) {
      totalCharges = baseSlab.zones[zoneKey];
      return totalCharges;
    }

    // 2. Next 250 grams (250-500 gm) - Additive on top of base
    if (weightInGrams > 250 && weightInGrams <= 500) {
      totalCharges = baseSlab.zones[zoneKey]; // Base charge
      if (slab250_500) {
        totalCharges += slab250_500.zones[zoneKey]; // Add 250-500gm charge
      }
      return totalCharges;
    }

    // 3. Additional 500 gm increments till 5kg (500gm to 4999gm)
    // Note: Exactly 5000gm is handled by checkpoint below
    if (weightInGrams > 500 && weightInGrams < 5000) {
      // Start with base + 250-500gm charge
      totalCharges = baseSlab.zones[zoneKey];
      if (slab250_500) {
        totalCharges += slab250_500.zones[zoneKey];
      }
      
      // Calculate how many 500gm increments beyond 500gm
      const weightBeyond500 = weightInGrams - 500;
      const increments500gm = Math.ceil(weightBeyond500 / 500);
      
      if (slabAdd500gm) {
        totalCharges += increments500gm * slabAdd500gm.zones[zoneKey];
      }
      
      return totalCharges;
    }

    // 4. Weight is exactly 5kg - use cumulative checkpoint
    if (weightInGrams === 5000 && slabUpto5kg) {
      return slabUpto5kg.zones[zoneKey];
    }

    // 5. Additional 1 kg increments from 5kg to 10kg (5001gm to 9999gm)
    // Note: Exactly 10000gm is handled by checkpoint below
    if (weightInGrams > 5000 && weightInGrams < 10000) {
      // Use "Upto 5kgs" as base
      if (!slabUpto5kg) return 0;
      totalCharges = slabUpto5kg.zones[zoneKey];
      
      // Calculate weight beyond 5kg
      const weightBeyond5kg = weightInGrams - 5000;
      // Any remaining grams (<1kg) are charged as a full kg increment
      // So we round up to the nearest kg
      const additionalKgs = Math.ceil(weightBeyond5kg / 1000);
      
      // Add per-kg charges (including partial kgs charged as full kg)
      if (slabAdd1kgTill10 && additionalKgs > 0) {
        totalCharges += additionalKgs * slabAdd1kgTill10.zones[zoneKey];
      }
      
      return totalCharges;
    }

    // 6. Weight is exactly 10kg - use cumulative checkpoint
    if (weightInGrams === 10000 && slabUpto10kg) {
      return slabUpto10kg.zones[zoneKey];
    }

    // 7. Additional 1 kg increments beyond 10kg
    if (weightInGrams > 10000) {
      // Use "Upto 10 kgs" as base
      if (!slabUpto10kg) return 0;
      totalCharges = slabUpto10kg.zones[zoneKey];
      
      // Calculate kgs beyond 10kg
      const weightBeyond10kg = weightInGrams - 10000;
      const additionalKgs = Math.ceil(weightBeyond10kg / 1000); // Round up to nearest kg
      
      if (slabAdd1kg) {
        totalCharges += additionalKgs * slabAdd1kg.zones[zoneKey];
      }
      
      return totalCharges;
    }

    return totalCharges;
  }

  private static calculateRTOCharges(rateCard: RateCard, weight: number, zone: string): number {
    const zoneKey = this.getZoneKey(zone);
    if (!zoneKey) return 0;

    // Find all required RTO slabs
    const baseSlab = rateCard.rtoCharges.find(s => s.condition === "DTO 0-250 gm");
    const slab250_500 = rateCard.rtoCharges.find(s => s.condition === "DTO 250-500 gm");
    const slabAdd500gm = rateCard.rtoCharges.find(s => s.condition === "DTO Add. 500 gm till 5kg");
    const slabUpto5kg = rateCard.rtoCharges.find(s => s.condition === "DTO Upto 5kgs");
    const slabAdd1kgTill10 = rateCard.rtoCharges.find(s => s.condition === "DTO Add. 1 kgs till 10k");
    const slabUpto10kg = rateCard.rtoCharges.find(s => s.condition === "DTO Upto 10 kgs");
    const slabAdd1kg = rateCard.rtoCharges.find(s => s.condition === "DTO Add. 1 kgs");

    if (!baseSlab) return 0;

    let totalCharges = 0;
    const weightInGrams = weight;

    // 1. First 250 grams (DTO 0-250 gm) - Base charge
    if (weightInGrams <= 250) {
      totalCharges = baseSlab.zones[zoneKey];
      return totalCharges;
    }

    // 2. Next 250 grams (DTO 250-500 gm) - Additive on top of base
    if (weightInGrams > 250 && weightInGrams <= 500) {
      totalCharges = baseSlab.zones[zoneKey]; // Base charge
      if (slab250_500) {
        totalCharges += slab250_500.zones[zoneKey]; // Add 250-500gm charge
      }
      return totalCharges;
    }

    // 3. Additional 500 gm increments till 5kg (500gm to 4999gm)
    // Note: Exactly 5000gm is handled by checkpoint below
    if (weightInGrams > 500 && weightInGrams < 5000) {
      // Start with base + 250-500gm charge
      totalCharges = baseSlab.zones[zoneKey];
      if (slab250_500) {
        totalCharges += slab250_500.zones[zoneKey];
      }
      
      // Calculate how many 500gm increments beyond 500gm
      const weightBeyond500 = weightInGrams - 500;
      const increments500gm = Math.ceil(weightBeyond500 / 500);
      
      if (slabAdd500gm) {
        totalCharges += increments500gm * slabAdd500gm.zones[zoneKey];
      }
      
      return totalCharges;
    }

    // 4. Weight is exactly 5kg - use cumulative checkpoint
    if (weightInGrams === 5000 && slabUpto5kg) {
      return slabUpto5kg.zones[zoneKey];
    }

    // 5. Additional 1 kg increments from 5kg to 10kg (5001gm to 9999gm)
    // Note: Exactly 10000gm is handled by checkpoint below
    if (weightInGrams > 5000 && weightInGrams < 10000) {
      // Use "DTO Upto 5kgs" as base
      if (!slabUpto5kg) return 0;
      totalCharges = slabUpto5kg.zones[zoneKey];
      
      // Calculate weight beyond 5kg
      const weightBeyond5kg = weightInGrams - 5000;
      // Any remaining grams (<1kg) are charged as a full kg increment
      // So we round up to the nearest kg
      const additionalKgs = Math.ceil(weightBeyond5kg / 1000);
      
      // Add per-kg charges (including partial kgs charged as full kg)
      if (slabAdd1kgTill10 && additionalKgs > 0) {
        totalCharges += additionalKgs * slabAdd1kgTill10.zones[zoneKey];
      }
      
      return totalCharges;
    }

    // 6. Weight is exactly 10kg - use cumulative checkpoint
    if (weightInGrams === 10000 && slabUpto10kg) {
      return slabUpto10kg.zones[zoneKey];
    }

    // 7. Additional 1 kg increments beyond 10kg
    if (weightInGrams > 10000) {
      // Use "DTO Upto 10 kgs" as base
      if (!slabUpto10kg) return 0;
      totalCharges = slabUpto10kg.zones[zoneKey];
      
      // Calculate kgs beyond 10kg
      const weightBeyond10kg = weightInGrams - 10000;
      const additionalKgs = Math.ceil(weightBeyond10kg / 1000); // Round up to nearest kg
      
      if (slabAdd1kg) {
        totalCharges += additionalKgs * slabAdd1kg.zones[zoneKey];
      }
      
      return totalCharges;
    }

    return totalCharges;
  }

  private static getZoneKey(zone: string): keyof RateCard['forwardCharges'][0]['zones'] | null {
    // Map zone from Delhivery API to our rate card zones
    // When Delhivery sends "C", we use C rates (previously C2 rates)
    // When Delhivery sends "D", we use D rates (previously D2 rates)
    // C1 and D1 zones are removed - no longer used
    const zoneMap: { [key: string]: keyof RateCard['forwardCharges'][0]['zones'] } = {
      'A': 'A',
      'B': 'B',
      'C': 'C', // Direct mapping - when Delhivery sends C, use C rates
      'C2': 'C', // Map C2 to C (backward compatibility)
      'D': 'D', // Direct mapping - when Delhivery sends D, use D rates
      'D2': 'D', // Map D2 to D (backward compatibility)
      'E': 'E',
      'F': 'F'
    };
    return zoneMap[zone] || null;
  }

  // Get all available user categories (from API)
  static async getAvailableUserCategories(): Promise<string[]> {
    try {
      const response = await apiService.get<{ success: boolean; data: string[] }>(
        '/shipping/user-categories'
      );
      
      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }
      
      // Fallback to hardcoded categories
      return Object.keys(RATE_CARDS);
    } catch (error) {
      console.error('Error fetching user categories from API:', error);
      // Fallback to hardcoded categories
      return Object.keys(RATE_CARDS);
    }
  }

  // Add or update rate card for a user category
  static updateRateCard(userCategory: string, rateCard: RateCard): void {
    RATE_CARDS[userCategory] = rateCard;
  }
}