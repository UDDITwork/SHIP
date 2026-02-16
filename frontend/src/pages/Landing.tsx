import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import { enquiryService, EnquiryData } from '../services/enquiryService';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    describe: '',
    monthlyLoad: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setSubmitMessage('');

    console.log('🚀 FORM SUBMISSION STARTED', {
      formData,
      timestamp: new Date().toISOString()
    });

    try {
      // First test CORS connectivity
      console.log('🧪 Testing CORS connectivity...');
      try {
        const corsTestResponse = await fetch('http://localhost:5000/api/test-cors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ test: 'cors-connectivity' })
        });
        console.log('✅ CORS Test Response:', corsTestResponse.status, await corsTestResponse.json());
      } catch (corsError) {
        console.error('❌ CORS Test Failed:', corsError);
      }

      const enquiryData: EnquiryData = {
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile,
        describe: formData.describe,
        monthlyLoad: formData.monthlyLoad
      };

      console.log('📤 Submitting enquiry data:', enquiryData);
      const response = await enquiryService.submitEnquiry(enquiryData);
      
      setSubmitStatus('success');
      setSubmitMessage(response.message);
      
      // Reset form after successful submission
      setFormData({
        name: '',
        email: '',
        mobile: '',
        describe: '',
        monthlyLoad: ''
      });

      // Show success message for 5 seconds
      setTimeout(() => {
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 5000);

    } catch (error: any) {
      console.error('Enquiry submission error:', error);
      setSubmitStatus('error');
      
      // Show specific validation errors if available
      if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map((err: any) => err.msg).join(', ');
        setSubmitMessage(`Validation failed: ${errorMessages}`);
      } else {
        setSubmitMessage(
          error.response?.data?.message || 
          'Failed to submit enquiry. Please try again later.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const features = [
    {
      icon: '/MULTI COURIER 1.svg',
      title: "Multiple Carrier Option",
      description: "Optimize your shipping costs by selecting from multiple carriers like Delhivery, Amazon, Xpressbees, DTDC, Trackon, and others."
    },
    {
      icon: '/tracking 1.svg',
      title: "Real Time Tracking",
      description: "Get real-time tracking access for both shippers and customers, ensuring complete visibility and transparency throughout the delivery journey."
    },
    {
      icon: '/api 2.svg',
      title: "API Integrated",
      description: "Easily connect your online store with Shipsarthi for centralized order management and seamless operations."
    },
    {
      icon: '/RTO 1.svg',
      title: "Smart NDR Management",
      description: "Intelligent Non-Delivery Report (NDR) handling helps reduce RTOs and flags fake delivery remarks by carriers."
    },
    {
      icon: '/b2b 1.svg',
      title: "Heavy Shipping",
      description: "Ship heavy and LTL shipments at competitive rates with our specialized logistics support."
    },
    {
      icon: '/manager 2.svg',
      title: "Customer Support",
      description: "Our support team is always available to help with your queries, ensuring a seamless and stress-free shipping experience for your business."
    }
  ];

  const benefits = [
    {
      icon: '/cost 1.svg',
      title: "Affordable Rates",
      description: "Affordable pricing without compromising service quality."
    },
    {
      icon: '/pan india 1.svg',
      title: "PAN India Coverage",
      description: "Pan-India serviceability across 29,000+ pincodes."
    },
    {
      icon: '/pickup 1.svg',
      title: "On Time Pickup",
      description: "On-time pickups guaranteed, strict action on delays."
    },
    {
      icon: '/weight 1.svg',
      title: "No False Weight",
      description: "We take strict action against fake weight discrepancies."
    },
    {
      icon: '/rto n 2.svg',
      title: "Reduce RTO",
      description: "Lower RTO rates through proactive call verification at the time of NDR."
    },
    {
      icon: '/support 1.svg',
      title: "Equal Support",
      description: "Dedicated support for businesses of all sizes - from startups to enterprises."
    }
  ];

  const partners = [
    { name: 'DELHIVERY', logo: '/image 1.svg', isLive: true },
    { name: 'AMAZON', logo: '/image 3.svg', isLive: false },
    { name: 'XPRESSBEES', logo: '/image 4.svg', isLive: false },
    { name: 'TRACKON', logo: '/image 5.svg', isLive: false },
    { name: 'DTDC', logo: '/image 6.svg', isLive: false }
  ];

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="header">
        <div className="header-container">
          <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <img src="/NEW LOGO.png" alt="Shipsarthi" className="logo-img" />
          </div>

          <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
            <a href="#services" className="nav-link" onClick={() => setMenuOpen(false)}>Services</a>
            <a
              href="/rate-calculator"
              className="nav-link"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                navigate('/rate-calculator');
              }}
            >
              Rate Calculator
            </a>
            <a href="#features" className="nav-link" onClick={() => setMenuOpen(false)}>Features</a>
            <a
              href="/about"
              className="nav-link"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                navigate('/about');
              }}
            >
              About
            </a>
            <a
              href="/contact"
              className="nav-link"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                navigate('/contact');
              }}
            >
              Contact Us
            </a>
          </nav>

          <div className="header-right">
            <button
              className="btn-track"
              onClick={() => navigate('/tracking')}
            >
              Track
            </button>
            <button
              className="btn-login"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
            <button
              className={`hamburger-btn${menuOpen ? ' active' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-left">
            <div className="enquireNow">Enquire Now !</div>
            <form className="enquiry-form" onSubmit={handleSubmit}>
              {/* Success/Error Messages */}
              {submitStatus === 'success' && (
                <div className="form-message success-message">
                  <div className="message-icon">✅</div>
                  <div className="message-text">{submitMessage}</div>
                </div>
              )}
              
              {submitStatus === 'error' && (
                <div className="form-message error-message">
                  <div className="message-icon">❌</div>
                  <div className="message-text">{submitMessage}</div>
                </div>
              )}

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Enter Name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter Email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Mobile</label>
                <input
                  type="tel"
                  name="mobile"
                  placeholder="Enter Mobile"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Describe you ?</label>
                <select
                  name="describe"
                  value={formData.describe}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Please Select</option>
                  <option value="ecommerce">E-commerce Business</option>
                  <option value="retailer">Retailer</option>
                  <option value="wholesaler">Wholesaler</option>
                  <option value="manufacturer">Manufacturer</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Monthly Load ?</label>
                <select
                  name="monthlyLoad"
                  value={formData.monthlyLoad}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Please Select</option>
                  <option value="0-100">0-100 shipments</option>
                  <option value="100-500">100-500 shipments</option>
                  <option value="500-1000">500-1000 shipments</option>
                  <option value="1000+">1000+ shipments</option>
                </select>
              </div>
              
              <button 
                type="submit" 
                className="submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="loading-spinner">⏳</span>
                    Submitting...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </form>
          </div>
          
          <div className="hero-right">
            <img src="/urban image 2.svg" alt="Urban Logistics" className="urban-image" />
            <img src="/Vector 1.svg" alt="Vector" className="vector-1" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="features-container">
          <h2 className="section-title">
            <span className="title-part-1">Our</span> <span className="title-part-2">Features</span>
          </h2>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">
                  <img src={feature.icon} alt={feature.title} />
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="why-choose-section">
        <div className="why-choose-container">
          <h2 className="section-title">
            <span className="title-part-1">Why Choose</span> <span className="title-part-2">Us?</span>
          </h2>
          
          <div className="why-choose-header">
            <div className="partner-illustration">
              <img src="/partner 1.svg" alt="Delivery Partners" />
            </div>
            <div className="tagline">
              <p className="tagline-text">
                <span className="tagline-line-1">Because Every Shipment</span>
                <span className="tagline-line-2">Deserves a <strong>Sarthi.</strong></span>
              </p>
            </div>
          </div>
          
          <div className="benefits-grid">
            {benefits.map((benefit, index) => (
              <div key={index} className="benefit-card">
                <div className="benefit-icon">
                  <img src={benefit.icon} alt={benefit.title} />
                </div>
                <h3 className="benefit-title">{benefit.title}</h3>
                <p className="benefit-description">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted Partners Section */}
      <section className="partners-section">
        <div className="partners-container">
          <h2 className="section-title">
            <span className="title-part-1">Trusted Courier</span> <span className="title-part-2">Partners</span>
          </h2>
          
          <div className="partners-grid">
            {partners.map((partner, index) => (
              <div
                key={index}
                className={`partner-logo${partner.isLive ? ' partner-live' : ' partner-coming'}`}
              >
                {!partner.isLive && <span className="coming-soon-badge">Coming Soon</span>}
                <img src={partner.logo} alt={partner.name} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Landing;

