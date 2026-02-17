// Location: backend/utils/validators.js
// Input validation and sanitization for webhooks

class WebhookValidators {
  /**
   * Validate scan push webhook payload
   */
  validateScanPushPayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    if (!payload.Shipment) {
      errors.push('Shipment data is required');
      return { valid: false, errors };
    }

    const shipment = payload.Shipment;
    
    if (!shipment.AWB || typeof shipment.AWB !== 'string') {
      errors.push('AWB/Waybill is required and must be a string');
    }

    if (shipment.Status) {
      if (!shipment.Status.Status || typeof shipment.Status.Status !== 'string') {
        errors.push('Status.Status is required and must be a string');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeScanPushPayload(payload)
    };
  }

  /**
   * Sanitize scan push payload
   */
  sanitizeScanPushPayload(payload) {
    const shipment = payload.Shipment || {};
    const status = shipment.Status || {};

    return {
      Shipment: {
        AWB: String(shipment.AWB || '').trim(),
        ReferenceNo: shipment.ReferenceNo ? String(shipment.ReferenceNo).trim() : null,
        NSLCode: shipment.NSLCode ? String(shipment.NSLCode).trim() : '',
        Sortcode: shipment.Sortcode ? String(shipment.Sortcode).trim() : '',
        PickUpDate: shipment.PickUpDate || null,
        Status: {
          Status: String(status.Status || '').trim(),
          StatusType: status.StatusType ? String(status.StatusType).trim() : '',
          StatusDateTime: status.StatusDateTime || null,
          StatusLocation: status.StatusLocation ? String(status.StatusLocation).trim() : '',
          Instructions: status.Instructions ? String(status.Instructions).trim() : ''
        }
      }
    };
  }

  /**
   * Validate EPOD webhook payload
   */
  validateEPODPayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    if (!payload.waybill || typeof payload.waybill !== 'string') {
      errors.push('waybill is required and must be a string');
    }

    if (!payload.EPOD || typeof payload.EPOD !== 'string') {
      errors.push('EPOD (base64 image) is required and must be a string');
    } else {
      // Validate base64 format
      const base64Regex = /^data:image\/[a-z]+;base64,/i;
      if (!payload.EPOD.match(/^[A-Za-z0-9+/=]+$/) && !base64Regex.test(payload.EPOD)) {
        errors.push('EPOD must be a valid base64 encoded string');
      }

      // Check size (max 10MB)
      const sizeInBytes = (payload.EPOD.length * 3) / 4;
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (sizeInBytes > maxSize) {
        errors.push(`EPOD image too large: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB (max 10MB)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeEPODPayload(payload)
    };
  }

  /**
   * Sanitize EPOD payload
   */
  sanitizeEPODPayload(payload) {
    return {
      waybill: String(payload.waybill || '').trim(),
      EPOD: String(payload.EPOD || '').trim(),
      orderID: payload.orderID ? String(payload.orderID).trim() : null
    };
  }

  /**
   * Validate sorter image webhook payload
   */
  validateSorterImagePayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    if (!payload.Waybill || typeof payload.Waybill !== 'string') {
      errors.push('Waybill is required and must be a string');
    }

    if (!payload.Weight_images || typeof payload.Weight_images !== 'string') {
      errors.push('Weight_images (base64 image) is required and must be a string');
    } else {
      // Validate base64 format
      const base64Regex = /^data:image\/[a-z]+;base64,/i;
      if (!payload.Weight_images.match(/^[A-Za-z0-9+/=]+$/) && !base64Regex.test(payload.Weight_images)) {
        errors.push('Weight_images must be a valid base64 encoded string');
      }

      // Check size (max 10MB)
      const sizeInBytes = (payload.Weight_images.length * 3) / 4;
      const maxSize = 10 * 1024 * 1024;
      if (sizeInBytes > maxSize) {
        errors.push(`Weight_images too large: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB (max 10MB)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: {
        Waybill: String(payload.Waybill || '').trim(),
        Weight_images: String(payload.Weight_images || '').trim(),
        doc: payload.doc ? String(payload.doc).trim() : ''
      }
    };
  }

  /**
   * Validate QC image webhook payload
   */
  validateQCImagePayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    if (!payload.waybillId || typeof payload.waybillId !== 'string') {
      errors.push('waybillId is required and must be a string');
    }

    if (!payload.Image || typeof payload.Image !== 'string') {
      errors.push('Image (base64 image) is required and must be a string');
    } else {
      // Validate base64 format
      const base64Regex = /^data:image\/[a-z]+;base64,/i;
      if (!payload.Image.match(/^[A-Za-z0-9+/=]+$/) && !base64Regex.test(payload.Image)) {
        errors.push('Image must be a valid base64 encoded string');
      }

      // Check size (max 10MB)
      const sizeInBytes = (payload.Image.length * 3) / 4;
      const maxSize = 10 * 1024 * 1024;
      if (sizeInBytes > maxSize) {
        errors.push(`Image too large: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB (max 10MB)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: {
        waybillId: String(payload.waybillId || '').trim(),
        returnId: payload.returnId ? String(payload.returnId).trim() : null,
        Image: String(payload.Image || '').trim()
      }
    };
  }
}

module.exports = new WebhookValidators();

