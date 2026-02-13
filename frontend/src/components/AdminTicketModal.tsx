import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Clock, User, Phone, Mail, Building, Calendar, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { adminService, AdminTicket } from '../services/adminService';
import { formatDate, formatDateTime } from '../utils/dateFormat';

interface AdminTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
}


interface TicketStats {
  total_tickets: number;
  status_breakdown: {
    [key: string]: number;
  };
}

const AdminTicketModal: React.FC<AdminTicketModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientEmail,
  clientPhone
}) => {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<AdminTicket | null>(null);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Fetch tickets when modal opens
  useEffect(() => {
    if (isOpen && clientId) {
      fetchTickets();
    }
  }, [isOpen, clientId]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminService.getClientTickets(clientId);
      setTickets(response.data.tickets);
      setStats(response.data.stats);
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetails = async (ticketId: string) => {
    try {
      const response = await adminService.getTicketDetails(ticketId);
      setSelectedTicket(response.data);
    } catch (err: any) {
      console.error('Error fetching ticket details:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch ticket details');
    }
  };

  const sendMessage = async (ticketId: string) => {
    if (!newMessage.trim()) return;

    try {
      setSendingMessage(true);
      
      await adminService.sendTicketMessage(ticketId, newMessage, false);
      setNewMessage('');
      // Refresh ticket details
      await fetchTicketDetails(ticketId);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.response?.data?.message || err.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      await adminService.updateTicketStatus(ticketId, status);
      // Refresh ticket details
      await fetchTicketDetails(ticketId);
      // Refresh tickets list
      await fetchTickets();
    } catch (err: any) {
      console.error('Error updating ticket status:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update ticket status');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      case 'escalated':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      case 'escalated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Client Tickets</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Building className="w-4 h-4" />
                <span>{clientName}</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail className="w-4 h-4" />
                <span>{clientEmail}</span>
              </div>
              <div className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                <span>{clientPhone}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Tickets List */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Tickets ({tickets.length})</h3>
              {stats && (
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-blue-600">Open: {stats.status_breakdown.open || 0}</span>
                  <span className="text-yellow-600">In Progress: {stats.status_breakdown.in_progress || 0}</span>
                  <span className="text-green-600">Resolved: {stats.status_breakdown.resolved || 0}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <div className="text-sm text-gray-600 mt-2">Loading tickets...</div>
                  </div>
                </div>
              ) : error ? (
                <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded">
                  <div className="font-medium">Error loading tickets</div>
                  <div className="text-sm mt-1">{error}</div>
                  <button 
                    onClick={fetchTickets}
                    className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Retry
                  </button>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-4 text-gray-500 text-center">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <div className="text-sm">No tickets found for this client</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket._id}
                      onClick={() => fetchTicketDetails(ticket._id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedTicket?._id === ticket._id
                          ? 'bg-blue-50 border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(ticket.status)}
                          <span className="font-medium text-sm">{ticket.ticket_id}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(ticket.status)}`}>
                            {ticket.status}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">{ticket.subject || 'No subject'}</div>
                      <div className="text-xs text-gray-500">
                        {ticket.created_at ? formatDate(ticket.created_at) : 'Unknown date'}
                      </div>
                      {ticket.user_id && (
                        <div className="text-xs text-gray-400 mt-1">
                          Client: {ticket.user_id.your_name || ticket.user_id.email}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Ticket Details */}
          <div className="w-1/2 flex flex-col">
            {selectedTicket ? (
              <>
                <div className="p-4 border-b">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{selectedTicket.ticket_id || selectedTicket._id}</h3>
                        <div className="flex gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(selectedTicket.status)}`}>
                            {selectedTicket.status}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(selectedTicket.priority || 'medium')}`}>
                            {selectedTicket.priority || 'medium'}
                          </span>
                        </div>
                      </div>
                  <div className="text-sm text-gray-600">{selectedTicket.subject || 'No subject'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created: {selectedTicket.created_at ? formatDateTime(selectedTicket.created_at) : 'Unknown date'}
                  </div>
                  {selectedTicket.user_id && (
                    <div className="text-xs text-gray-400 mt-1">
                      Client: {selectedTicket.user_id.your_name || selectedTicket.user_id.email}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {selectedTicket.description || 'No description provided'}
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Conversation</h4>
                    <div className="space-y-3">
                      {selectedTicket.conversation && selectedTicket.conversation.length > 0 ? selectedTicket.conversation.map((message, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg ${
                            message.message_type === 'admin'
                              ? 'bg-blue-50 border-l-4 border-blue-400'
                              : message.message_type === 'user'
                              ? 'bg-gray-50 border-l-4 border-gray-400'
                              : 'bg-yellow-50 border-l-4 border-yellow-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{message.sender_name}</span>
                            <span className="text-xs text-gray-500">
                              {message.timestamp ? formatDateTime(message.timestamp) : 'Unknown time'}
                            </span>
                            {message.is_internal && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                Internal
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-700">{message.message_content}</div>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-500">Attachments:</div>
                              {message.attachments.map((attachment, idx) => (
                                <a
                                  key={idx}
                                  href={attachment.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline block"
                                >
                                  {attachment.file_name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )) : (
                        <div className="text-gray-500 text-center py-4">
                          <div className="text-center">
                            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <div className="text-sm">No conversation yet</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-2">Admin Actions</h4>
                    <div className="text-xs text-gray-500 mb-3">
                      Manage ticket status and respond to client
                    </div>
                    
                    {/* Status Update */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Update Status
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedTicket.status}
                          onChange={(e) => updateTicketStatus(selectedTicket._id, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="waiting_customer">Waiting Customer</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                          <option value="escalated">Escalated</option>
                        </select>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Current status: {selectedTicket.status}
                      </div>
                    </div>

                    {/* Send Message */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Send Message
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your message..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          rows={2}
                        />
                        <button
                          onClick={() => sendMessage(selectedTicket._id)}
                          disabled={!newMessage.trim() || sendingMessage}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {sendingMessage ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Sending...
                            </>
                          ) : (
                            'Send'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <div className="text-sm">Select a ticket to view details</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTicketModal;
