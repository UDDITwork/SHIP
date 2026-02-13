import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import './App.css';

// Import pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import OrderDetails from './pages/OrderDetails';
import AutofillPackage from './pages/AutofillPackage';
import AutofillProduct from './pages/AutofillProduct';
import NDR from './pages/NDR';
import Support from './pages/Support';
import TicketDetail from './pages/TicketDetail';
import Notifications from './pages/Notifications';
import Tools from './pages/Tools';
import Billing from './pages/Billing';
import Remittances from './pages/Remittances';
import RemittanceDetail from './pages/RemittanceDetail';
import WeightDiscrepancies from './pages/WeightDiscrepancies';
import AddWarehouse from './pages/AddWarehouse';
import WarehouseManagement from './pages/WarehouseManagement';
// import Settings from './pages/Settings'; // Replaced with AccountSettings
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import ShipmentCancellation from './pages/ShipmentCancellation';
import OrderCancellation from './pages/OrderCancellation';
import ReturnPolicy from './pages/ReturnPolicy';
import Contact from './pages/Contact';
import About from './pages/About';
import Tracking from './pages/Tracking';
import TrackingDetail from './pages/TrackingDetail';
import PublicRateCalculator from './pages/PublicRateCalculator';
import Channel from './pages/Channel';
import AccountSettings from './pages/AccountSettings';
import ManageLabel from './pages/ManageLabel';
import AssignCourier from './pages/AssignCourier';
import Customers from './pages/Customers';
import InvoiceList from './pages/InvoiceList';
import InvoiceDetail from './pages/InvoiceDetail';
import CreditNotes from './pages/CreditNotes';
import DebitNotes from './pages/DebitNotes';

// Admin Components
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminClients from './pages/AdminClients';
import AdminClientTickets from './pages/AdminClientTickets';
import AdminTickets from './pages/AdminTickets';
import AdminStaffManagement from './pages/AdminStaffManagement';
import AdminRateCard from './pages/AdminRateCard';
import AdminRateCardCategory from './pages/AdminRateCardCategory';
import AdminWalletRecharge from './pages/AdminWalletRecharge';
import AdminWeightDiscrepancies from './pages/AdminWeightDiscrepancies';
import AdminBilling from './pages/AdminBilling';
import AdminRemittances from './pages/AdminRemittances';
import AdminOrders from './pages/AdminOrders';
import AdminClientDashboard from './pages/AdminClientDashboard';
import AdminNDR from './pages/AdminNDR';
import AdminCarriers from './pages/AdminCarriers';
import AdminCarrierRates from './pages/AdminCarrierRates';
import AdminKYC from './pages/AdminKYC';
import AdminLayout from './components/AdminLayout';

// Protected Route Component
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/tracking/detail" element={<TrackingDetail />} />
            <Route path="/public/rate-calculator" element={<PublicRateCalculator />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-conditions" element={<TermsConditions />} />
            <Route path="/return-policy" element={<ReturnPolicy />} />
            <Route path="/shipment-cancellation" element={<ShipmentCancellation />} />
            <Route path="/order-cancellation" element={<OrderCancellation />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected Routes */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/orders" 
              element={
                <ProtectedRoute>
                  <Orders />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/orders/:orderId"
              element={
                <ProtectedRoute>
                  <OrderDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/assign-courier/:orderId"
              element={
                <ProtectedRoute>
                  <AssignCourier />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/customers" 
              element={
                <ProtectedRoute>
                  <Customers />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/autofill/package"
              element={
                <ProtectedRoute>
                  <AutofillPackage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/autofill/product"
              element={
                <ProtectedRoute>
                  <AutofillProduct />
                </ProtectedRoute>
              }
            />
            {/* Backward compatibility redirect */}
            <Route path="/packages" element={<Navigate to="/autofill/package" replace />} />
            <Route 
              path="/ndr" 
              element={
                <ProtectedRoute>
                  <NDR />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/support" 
              element={
                <ProtectedRoute>
                  <Support />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/support/tickets/:id"
              element={
                <ProtectedRoute>
                  <TicketDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tools" 
              element={
                <ProtectedRoute>
                  <Tools />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/billing" 
              element={
                <ProtectedRoute>
                  <Billing />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/invoices" 
              element={
                <ProtectedRoute>
                  <InvoiceList />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/invoices/:id" 
              element={
                <ProtectedRoute>
                  <InvoiceDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/invoices/credit-notes" 
              element={
                <ProtectedRoute>
                  <CreditNotes />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/invoices/debit-notes" 
              element={
                <ProtectedRoute>
                  <DebitNotes />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/remittances" 
              element={
                <ProtectedRoute>
                  <Remittances />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/remittances/:remittanceNumber" 
              element={
                <ProtectedRoute>
                  <RemittanceDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/weight-discrepancies" 
              element={
                <ProtectedRoute>
                  <WeightDiscrepancies />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/warehouse" 
              element={
                <ProtectedRoute>
                  <WarehouseManagement />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/warehouses/add" 
              element={
                <ProtectedRoute>
                  <AddWarehouse />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/warehouses/edit/:id" 
              element={
                <ProtectedRoute>
                  <AddWarehouse />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/edit-warehouse/:id" 
              element={
                <ProtectedRoute>
                  <AddWarehouse />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/channel" 
              element={
                <ProtectedRoute>
                  <Channel />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/account" 
              element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/account-settings" 
              element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/settings/manage-label"
              element={
                <ProtectedRoute>
                  <ManageLabel />
                </ProtectedRoute>
              }
            />

            {/* Admin Protected Routes */}
            <Route 
              path="/admin/dashboard" 
              element={
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              } 
            />
            <Route
              path="/admin/clients"
              element={
                <AdminLayout>
                  <AdminClients />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/clients/:clientId/dashboard"
              element={
                <AdminLayout>
                  <AdminClientDashboard />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/clients/:clientId/kyc"
              element={
                <AdminLayout>
                  <AdminKYC />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/tickets"
              element={
                <AdminLayout>
                  <AdminTickets />
                </AdminLayout>
              }
            />
            <Route 
              path="/admin/clients/:clientId/tickets" 
              element={
                <AdminLayout>
                  <AdminClientTickets />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/clients/:clientId/tickets/:ticketId" 
              element={
                <AdminLayout>
                  <AdminClientTickets />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/wallet-recharge" 
              element={
                <AdminLayout>
                  <AdminWalletRecharge />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/weight-discrepancies" 
              element={
                <AdminLayout>
                  <AdminWeightDiscrepancies />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/billing" 
              element={
                <AdminLayout>
                  <AdminBilling />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/billing/:clientId" 
              element={
                <AdminLayout>
                  <AdminBilling />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/remittances" 
              element={
                <AdminLayout>
                  <AdminRemittances />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/orders" 
              element={
                <AdminLayout>
                  <AdminOrders />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/orders/:clientId" 
              element={
                <AdminLayout>
                  <AdminOrders />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/ndr" 
              element={
                <AdminLayout>
                  <AdminNDR />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/ndr/:clientId" 
              element={
                <AdminLayout>
                  <AdminNDR />
                </AdminLayout>
              } 
            />
            <Route 
              path="/admin/staff-management" 
              element={
                <AdminLayout>
                  <AdminStaffManagement />
                </AdminLayout>
              } 
            />
            <Route
              path="/admin/ratecard"
              element={
                <AdminLayout>
                  <AdminRateCard />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/ratecard/:userCategory"
              element={
                <AdminLayout>
                  <AdminRateCardCategory />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/carriers"
              element={
                <AdminLayout>
                  <AdminCarriers />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/carriers/:carrierId/rates"
              element={
                <AdminLayout>
                  <AdminCarrierRates />
                </AdminLayout>
              }
            />

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
