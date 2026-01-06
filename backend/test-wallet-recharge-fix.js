const axios = require('axios');

// Test the wallet recharge functionality
async function testWalletRecharge() {
  try {
    console.log('🧪 Testing wallet recharge functionality...');

    // Test data
    const testData = {
      client_id: '68f3d3fe88beee992d6ee1f2', // Use a real client ID from your system
      amount: 100,
      description: 'Test wallet recharge'
    };

    const response = await axios.post('http://localhost:5000/api/admin/wallet-recharge', testData, {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': 'udditalerts247@gmail.com',
        'x-admin-password': 'jpmcA123'
      }
    });

    console.log('✅ Wallet recharge successful:', response.data);

    // Test wallet balance retrieval
    const balanceResponse = await axios.get(`http://localhost:5000/api/user/wallet-balance`, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
      }
    });

    console.log('💰 Current wallet balance:', balanceResponse.data);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testWalletRecharge();
