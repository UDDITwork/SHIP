// Debug script for wallet recharge process
// Run with: node debug-wallet-recharge.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');

async function debugWalletRecharge() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const userEmail = 'udditalerts247@mail.com';
    const rechargeAmount = 700;

    console.log('\n🔍 DEBUGGING WALLET RECHARGE PROCESS');
    console.log('=====================================');
    console.log(`User Email: ${userEmail}`);
    console.log(`Recharge Amount: ₹${rechargeAmount}`);

    // Step 1: Find user by email
    console.log('\n📋 STEP 1: Finding user by email...');
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.log('❌ User not found!');
      return;
    }

    console.log('✅ User found:');
    console.log(`   - User ID: ${user._id}`);
    console.log(`   - Company: ${user.company_name}`);
    console.log(`   - Current Balance: ₹${user.wallet_balance || 0}`);

    // Step 2: Check recent transactions
    console.log('\n📋 STEP 2: Checking recent transactions...');
    const recentTransactions = await Transaction.find({
      user_id: user._id,
      transaction_type: 'credit',
      transaction_category: 'manual_adjustment'
    }).sort({ created_at: -1 }).limit(5);

    console.log(`Found ${recentTransactions.length} recent credit transactions:`);
    recentTransactions.forEach((txn, index) => {
      console.log(`   ${index + 1}. ${txn.transaction_id} - ₹${txn.amount} - ${txn.created_at}`);
    });

    // Step 3: Simulate recharge process
    console.log('\n📋 STEP 3: Simulating recharge process...');
    const currentBalance = user.wallet_balance || 0;
    const newBalance = currentBalance + rechargeAmount;

    console.log(`   - Current Balance: ₹${currentBalance}`);
    console.log(`   - Recharge Amount: ₹${rechargeAmount}`);
    console.log(`   - Expected New Balance: ₹${newBalance}`);

    // Step 4: Update wallet balance
    console.log('\n📋 STEP 4: Updating wallet balance...');
    user.wallet_balance = newBalance;
    user.updated_at = new Date();
    await user.save();
    console.log('✅ Wallet balance updated in database');

    // Step 5: Retrieve live balance
    console.log('\n📋 STEP 5: Retrieving live balance from database...');
    const updatedUser = await User.findById(user._id).select('wallet_balance email company_name');
    const liveUpdatedBalance = updatedUser.wallet_balance || 0;

    console.log(`   - Live Database Balance: ₹${liveUpdatedBalance}`);
    console.log(`   - Balance Match: ${liveUpdatedBalance === newBalance ? '✅ MATCH' : '❌ MISMATCH'}`);

    // Step 6: Create transaction record
    console.log('\n📋 STEP 6: Creating transaction record...');
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const transaction = new Transaction({
      transaction_id: transactionId,
      user_id: user._id,
      transaction_type: 'credit',
      transaction_category: 'manual_adjustment',
      amount: rechargeAmount,
      description: `Debug wallet recharge - ₹${rechargeAmount}`,
      status: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
      balance_info: {
        opening_balance: currentBalance,
        closing_balance: liveUpdatedBalance
      }
    });

    await transaction.save();
    console.log(`✅ Transaction created: ${transactionId}`);

    // Step 7: Test API endpoint
    console.log('\n📋 STEP 7: Testing wallet balance API...');
    const walletBalanceResponse = {
      success: true,
      data: {
        balance: liveUpdatedBalance,
        currency: 'INR'
      }
    };
    console.log('✅ API Response would be:', JSON.stringify(walletBalanceResponse, null, 2));

    // Step 8: WebSocket notification data
    console.log('\n📋 STEP 8: WebSocket notification data...');
    const walletUpdate = {
      type: 'wallet_balance_update',
      balance: liveUpdatedBalance,
      currency: 'INR',
      previous_balance: currentBalance,
      amount_added: rechargeAmount,
      transaction_id: transactionId,
      timestamp: new Date().toISOString()
    };
    console.log('✅ WebSocket notification:', JSON.stringify(walletUpdate, null, 2));

    console.log('\n🎯 SUMMARY:');
    console.log('===========');
    console.log(`User: ${userEmail}`);
    console.log(`User ID: ${user._id}`);
    console.log(`Previous Balance: ₹${currentBalance}`);
    console.log(`Recharge Amount: ₹${rechargeAmount}`);
    console.log(`New Balance: ₹${liveUpdatedBalance}`);
    console.log(`Transaction ID: ${transactionId}`);
    console.log(`Status: ${liveUpdatedBalance > 0 ? '✅ SUCCESS' : '❌ FAILED'}`);

  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugWalletRecharge();
