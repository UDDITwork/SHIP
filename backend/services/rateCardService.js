// Rate Card Service for managing shipping charges based on user categories
const RateCard = require('../models/RateCard');

// In-memory cache for ratecards (optional performance optimization)
const rateCardCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class RateCardService {
  // Get rate card for a specific user category (from database)
  // Legacy method - defaults to Surface for backward compatibility
  static async getRateCard(userCategory) {
    try {
      // Normalize category name
      let normalizedCategory = userCategory;
      if (userCategory === 'Advanced User') {
        normalizedCategory = 'Advanced';
      }

      // Check cache first
      const cacheKey = normalizedCategory.toLowerCase();
      const cached = rateCardCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
      }

      // Fetch from database
      const rateCard = await RateCard.findByCategory(normalizedCategory);

      if (!rateCard) {
        return null;
      }

      // Convert Mongoose document to plain object
      const rateCardObj = rateCard.toObject ? rateCard.toObject() : rateCard;

      // Cache the result
      rateCardCache.set(cacheKey, {
        data: rateCardObj,
        timestamp: Date.now()
      });

      return rateCardObj;
    } catch (error) {
      console.error('Error fetching ratecard from database:', error);
      return null;
    }
  }

  // Get rate card for a specific user category and carrier
  static async getRateCardByCarrier(userCategory, carrierId) {
    try {
      // Normalize category name
      let normalizedCategory = userCategory;
      if (userCategory === 'Advanced User') {
        normalizedCategory = 'Advanced';
      }

      // Check cache first (include carrier in cache key)
      const cacheKey = `${normalizedCategory.toLowerCase()}_${carrierId}`;
      const cached = rateCardCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
      }

      // Fetch from database with carrier filter
      const rateCard = await RateCard.findOne({
        userCategory: normalizedCategory,
        carrier_id: carrierId,
        is_current: true
      }).lean();

      if (!rateCard) {
        return null;
      }

      // Cache the result
      rateCardCache.set(cacheKey, {
        data: rateCard,
        timestamp: Date.now()
      });

      return rateCard;
    } catch (error) {
      console.error('Error fetching ratecard by carrier from database:', error);
      return null;
    }
  }

  // Get available user categories (from database)
  static async getAvailableUserCategories() {
    try {
      const rateCards = await RateCard.find({}).select('userCategory').lean();
      const categories = rateCards.map(rc => rc.userCategory);
      
      // Add alias for "Advanced User" if "Advanced" exists
      if (categories.includes('Advanced') && !categories.includes('Advanced User')) {
        categories.push('Advanced User');
      }
      
      return categories;
    } catch (error) {
      console.error('Error fetching user categories from database:', error);
      return [];
    }
  }

  // Clear cache (useful when ratecard is updated)
  static clearCache(userCategory = null) {
    if (userCategory) {
      const cacheKey = userCategory.toLowerCase();
      rateCardCache.delete(cacheKey);
    } else {
      rateCardCache.clear();
    }
  }

  // Calculate shipping charges based on weight, dimensions, and zone
  // Legacy method - defaults to Surface for backward compatibility
  static async calculateShippingCharges(userCategory, weight, dimensions, zone, codAmount = 0, orderType = 'forward') {
    const rateCard = await this.getRateCard(userCategory);
    if (!rateCard) {
      throw new Error(`Rate card not found for user category: ${userCategory}`);
    }

    // Calculate volumetric weight (LxBxH/5000) in kg, then convert to grams
    // Dimensions are in cm, so result is in kg
    const volumetricWeightKg = (dimensions.length * dimensions.breadth * dimensions.height) / 5000;
    const volumetricWeightGrams = volumetricWeightKg * 1000; // Convert to grams

    // Use higher of actual weight (in grams) or volumetric weight (in grams)
    const chargeableWeight = Math.max(weight, volumetricWeightGrams);

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

    // CORRECT LOGIC: Don't add forward and RTO charges together
    // Calculate total based on order type
    let totalCharges;
    if (orderType === 'forward') {
      totalCharges = forwardCharges + codCharges;
    } else if (orderType === 'rto') {
      totalCharges = rtoCharges + codCharges;
    } else {
      // For display purposes, show forward charges as default
      totalCharges = forwardCharges + codCharges;
    }

    return {
      forwardCharges,
      rtoCharges,
      codCharges,
      totalCharges,
      volumetricWeight: volumetricWeightKg, // Return in kg for display
      chargeableWeight: chargeableWeight / 1000, // Return in kg for display (converted from grams)
      orderType: orderType
    };
  }

  // Calculate shipping charges by carrier (Surface/Air)
  // NEW METHOD: Supports carrier selection for Delhivery Surface vs Air
  static async calculateShippingChargesByCarrier(userCategory, weight, dimensions, zone, codAmount = 0, orderType = 'forward', carrierId = null) {
    let rateCard;

    if (carrierId) {
      // Fetch rate card for specific carrier + category
      rateCard = await this.getRateCardByCarrier(userCategory, carrierId);
      if (!rateCard) {
        throw new Error(`Rate card not found for user category: ${userCategory} and carrier: ${carrierId}`);
      }
    } else {
      // Legacy: fetch by category only (defaults to Surface)
      rateCard = await this.getRateCard(userCategory);
      if (!rateCard) {
        throw new Error(`Rate card not found for user category: ${userCategory}`);
      }
    }

    // Calculate volumetric weight (LxBxH/5000) in kg, then convert to grams
    // Dimensions are in cm, so result is in kg
    const volumetricWeightKg = (dimensions.length * dimensions.breadth * dimensions.height) / 5000;
    const volumetricWeightGrams = volumetricWeightKg * 1000; // Convert to grams

    // Use higher of actual weight (in grams) or volumetric weight (in grams)
    const chargeableWeight = Math.max(weight, volumetricWeightGrams);

    // Calculate forward charges (same logic, different rate data)
    const forwardCharges = this.calculateForwardCharges(rateCard, chargeableWeight, zone);

    // Calculate RTO charges (same logic, different rate data)
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
      volumetricWeight: volumetricWeightKg,
      chargeableWeight: chargeableWeight / 1000,
      orderType: orderType,
      carrierId: carrierId // Return carrier ID for reference
    };
  }

  static calculateForwardCharges(rateCard, weight, zone) {
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

  static calculateRTOCharges(rateCard, weight, zone) {
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

  static getZoneKey(zone) {
    // Map zone from Delhivery API to our rate card zones
    // When Delhivery sends "C", we use C rates (previously C2 rates)
    // When Delhivery sends "D", we use D rates (previously D2 rates)
    // C1 and D1 zones are normalized to C and D respectively before reaching here
    // This mapping is for backward compatibility and safety
    const zoneMap = {
      'A': 'A',
      'B': 'B',
      'C': 'C', // Direct mapping - when Delhivery sends C, use C rates
      'C1': 'C', // Map C1 to C (normalized before reaching here, but added for safety)
      'C2': 'C', // Map C2 to C (backward compatibility)
      'D': 'D', // Direct mapping - when Delhivery sends D, use D rates
      'D1': 'D', // Map D1 to D (normalized before reaching here, but added for safety)
      'D2': 'D', // Map D2 to D (backward compatibility)
      'E': 'E',
      'F': 'F'
    };
    return zoneMap[zone] || null;
  }

  // Note: getAvailableUserCategories and clearCache methods are defined above
  // The old methods that referenced RATE_CARDS have been removed
}

module.exports = RateCardService;