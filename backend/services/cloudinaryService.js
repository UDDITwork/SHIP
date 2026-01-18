// Location: backend/services/cloudinaryService.js
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ddutgk3p2',
  api_key: process.env.CLOUDINARY_API_KEY || '373273615713995',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'ulDjq9v1X6rWOfI4Iz7VFxDpvkg'
});

class CloudinaryService {
  async uploadFile(fileBuffer, options = {}) {
    try {
      const { folder = 'shipsarthi/tickets', resource_type = 'auto', mimetype } = options;

      // ✅ AUTO-DETECT resource type if not provided
      const finalResourceType = resource_type === 'auto' 
        ? this.getResourceType(mimetype) 
        : resource_type;
        
      console.log('🔍 CLOUDINARY SERVICE DEBUG:', {
        originalResourceType: resource_type,
        mimetype,
        detectedType: this.getResourceType(mimetype),
        finalResourceType,
        isPDF: mimetype === 'application/pdf'
      });

      return new Promise((resolve, reject) => {
        // Configure upload options based on resource type
        const uploadOptions = { 
          folder, 
          resource_type: finalResourceType  // ✅ Use detected type
        };
        
        // Only add quality for images, not for raw files like PDFs
        if (finalResourceType === 'image') {
          uploadOptions.quality = 'auto:good';
        }
        
        // Add flags if provided (for documents)
        if (options.flags) {
          uploadOptions.flags = options.flags;
        }
        
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve({
              success: true,
              url: result.secure_url,
              public_id: result.public_id,
              resource_type: result.resource_type,
              size: result.bytes
            });
          }
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
      });
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(typeof error === 'string' ? error : 'Failed to upload file');
    }
  }

  async uploadMultipleFiles(files, options = {}) {
    try {
      const uploadPromises = files.map(file => this.uploadFile(file.buffer, options));
      const results = await Promise.all(uploadPromises);
      return { success: true, files: results };
    } catch (error) {
      throw new Error('Failed to upload files');
    }
  }

  async deleteFile(publicId, resourceType = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return { success: result.result === 'ok' };
    } catch (error) {
      throw new Error('Failed to delete file');
    }
  }

  // ✅ Dedicated method for document uploads (PDFs, etc.)
  async uploadDocument(fileBuffer, options = {}) {
    const { folder = 'shipsarthi/documents', mimetype } = options;
    
    return this.uploadFile(fileBuffer, {
      folder,
      resource_type: 'raw',  // ✅ Explicit for documents
      mimetype              // ✅ Pass mimetype for proper detection
      // Removed flags: 'attachment' to allow inline PDF viewing
    });
  }

  getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'document';
  }

  getResourceType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'auto'; // Cloudinary handles audio with 'auto' resource type
    if (mimetype === 'application/pdf') return 'raw';
    return 'raw';
  }

  validateFile(file, limits = {}) {
    const defaultLimits = {
      image: 2 * 1024 * 1024,
      audio: 5 * 1024 * 1024,
      video: 5 * 1024 * 1024,
      document: 5 * 1024 * 1024
    };
    const fileLimits = { ...defaultLimits, ...limits };
    const fileType = this.getFileType(file.mimetype);
    const maxSize = fileLimits[fileType];

    if (file.size > maxSize) {
      return { valid: false, error: `${fileType} exceeds ${maxSize / (1024 * 1024)}MB limit` };
    }
    return { valid: true };
  }
}

module.exports = new CloudinaryService();