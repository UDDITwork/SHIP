// Test script to verify real-time wallet balance updates
const axios = require('axios');
const WebSocket = require('ws');

// Configuration
const BASE_URL = 'http://localhost:5000';
const WS_URL = 'ws://localhost:5000';

// Test data
const TEST_CLIENT_ID = '507f1f77bcf86cd799439011'; // Replace with actual client ID
const TEST_AMOUNT = 1000;
const ADMIN_TOKEN = 'your-admin-token'; // Replace with actual admin token

async function testWalletRealtimeUpdate() {
  console.log('🧪 Testing Real-time Wallet Balance Updates...\n');

  try {
    // 1. Connect to WebSocket as client
    console.log('1. Connecting to WebSocket as client...');
    const ws = new WebSocket(WS_URL);

    let wsConnected = false;
    let walletUpdateReceived = false;

    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      wsConnected = true;

      // Authenticate as client
      ws.send(JSON.stringify({
        type: 'authenticate',
        user_id: TEST_CLIENT_ID
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket message received:', message);

      if (message.type === 'authenticated') {
        console.log('✅ Client authenticated successfully');
      } else if (message.type === 'wallet_balance_update') {
        console.log('💰 Wallet balance update received!');
        console.log('   - New Balance:', message.balance);
        console.log('   - Amount Added:', message.amount_added);
        console.log('   - Transaction ID:', message.transaction_id);
        walletUpdateReceived = true;
      } else if (message.type === 'wallet_recharge') {
        console.log('💳 Wallet recharge notification received!');
        console.log('   - Message:', message.message);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    // Wait for WebSocket connection
    await new Promise(resolve => {
      const checkConnection = () => {
        if (wsConnected) {
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });

    // 2. Wait a moment for authentication
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Make admin wallet recharge request
    console.log('\n2. Making admin wallet recharge request...');
    const rechargeResponse = await axios.post(`${BASE_URL}/api/admin/wallet-recharge`, {
      client_id: TEST_CLIENT_ID,
      amount: TEST_AMOUNT,
      description: 'Test real-time update'
    }, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Admin recharge response:', rechargeResponse.data);

    // 4. Wait for WebSocket notification
    console.log('\n3. Waiting for real-time notification...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Check results
    console.log('\n📊 Test Results:');
    console.log('   - WebSocket Connected:', wsConnected ? '✅' : '❌');
    console.log('   - Wallet Update Received:', walletUpdateReceived ? '✅' : '❌');
    console.log('   - Admin Recharge Success:', rechargeResponse.status === 200 ? '✅' : '❌');

    if (walletUpdateReceived) {
      console.log('\n🎉 SUCCESS: Real-time wallet balance updates are working!');
    } else {
      console.log('\n❌ FAILED: Real-time wallet balance updates are not working');
    }

    // Cleanup
    ws.close();
    console.log('\n🔌 WebSocket connection closed');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
if (require.main === module) {
  testWalletRealtimeUpdate();
}

module.exports = { testWalletRealtimeUpdate };
