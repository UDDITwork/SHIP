import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { ticketService, Ticket } from '../services/ticketService';
import { ArrowLeft, Send, Paperclip, User, MessageSquare } from 'lucide-react';
import './TicketDetail.css';
import { environmentConfig } from '../config/environment';
import AWBLink from '../components/AWBLink';

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const ticketData = await ticketService.getTicket(id);
      setTicket(ticketData);
    } catch (error: any) {
      console.error('Error fetching ticket:', error);
      alert(error.response?.data?.message || 'Failed to load ticket');
      navigate('/support');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (id) {
      fetchTicket();
    }
  }, [id, fetchTicket]);

  useEffect(() => {
    const handleWindowFocus = () => {
      fetchTicket();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [fetchTicket]);

  const handleAttachmentDownload = useCallback(async (attachment: any) => {
    if (!ticket || !attachment) {
      return;
    }

    const attachmentKey = attachment._id || attachment.file_url;

    if (!attachment._id || !attachmentKey) {
      if (attachment.file_url) {
        window.open(attachment.file_url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const downloadUrl = `${environmentConfig.apiUrl}/support/${ticket._id}/attachments/${attachment._id}/download`;
    const token = localStorage.getItem('token');

    if (!token) {
      alert('Please log in to download attachments.');
      return;
    }

    try {
      setDownloadingAttachmentId(attachmentKey);

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to download attachment' }));
        throw new Error(errorData.message || 'Failed to download attachment');
      }

      const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('Content-Disposition');

      let filename = attachment.file_name || 'attachment';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
        }
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const isViewable = contentType.startsWith('application/pdf') || contentType.startsWith('image/');

      if (isViewable) {
        const newWindow = window.open(blobUrl, '_blank');
        if (!newWindow) {
          alert('Please allow popups to view the attachment.');
        }
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (error) {
            console.warn('Error revoking blob URL:', error);
          }
        }, 60_000);
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (error) {
            console.warn('Error revoking blob URL:', error);
          }
        }, 10_000);
      }
    } catch (error: any) {
      console.error('Error downloading attachment:', error);
      alert(error?.message || 'Failed to download attachment. Please try again.');
    } finally {
      setDownloadingAttachmentId(null);
    }
  }, [ticket]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const invalidFiles = files.filter(file => {
        if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) return true;
        if (file.type.startsWith('audio/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('video/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('application/') && file.size > 5 * 1024 * 1024) return true;
        return false;
      });

      if (invalidFiles.length > 0) {
        alert('Some files exceed the size limit:\nImage: 2MB, Audio/Video/Document: 5MB');
        return;
      }

      setSelectedFiles(prev => [...prev, ...files].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) {
      alert('Please enter a message or attach a file');
      return;
    }

    if (!id) return;

    try {
      setSending(true);
      await ticketService.addComment(id, {
        comment: newMessage,
        files: selectedFiles
      });
      setNewMessage('');
      setSelectedFiles([]);
      await fetchTicket(); // Refresh ticket to show new message
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert(error.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'waiting_customer': return '#f97316';
      case 'resolved': return '#10b981';
      case 'closed': return '#6b7280';
      case 'escalated': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Format date with time in DD/MM/YYYY, HH:MM AM/PM format
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${day}/${month}/${year}, ${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="ticket-detail-container">
          <div className="loading">Loading ticket...</div>
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="ticket-detail-container">
          <div className="error">Ticket not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ticket-detail-container">
        <div className="ticket-detail-header">
          <button className="back-btn" onClick={() => navigate('/support')}>
            <ArrowLeft size={20} /> Back to Tickets
          </button>
          <div className="ticket-header-info">
            <h1>Ticket #{ticket.ticket_id}</h1>
            <span 
              className="status-badge" 
              style={{ backgroundColor: getStatusColor(ticket.status) }}
            >
              {ticket.status}
            </span>
          </div>
        </div>

        <div className="ticket-info-section">
          <div className="info-row">
            <span className="info-label">Category:</span>
            <span className="info-value">{ticket.category}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Priority:</span>
            <span className="info-value">{ticket.priority}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Created:</span>
            <span className="info-value">{formatDate(ticket.created_at || ticket.createdAt || undefined)}</span>
          </div>
          {ticket.awb_numbers && ticket.awb_numbers.length > 0 && (
            <div className="info-row">
              <span className="info-label">AWB Numbers:</span>
              <span className="info-value">
                {ticket.awb_numbers.map((awb: string, idx: number) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && ', '}
                    <AWBLink awb={awb} />
                  </React.Fragment>
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="conversation-section">
          <h2>Conversation</h2>
          <div className="conversation-messages">
            {ticket.conversation && ticket.conversation.length > 0 ? (
              ticket.conversation.map((msg, index) => (
                <div 
                  key={index} 
                  className={`message ${msg.message_type === 'user' ? 'message-user' : 'message-admin'}`}
                >
                  <div className="message-header">
                    <div className="message-sender">
                      {msg.message_type === 'user' ? (
                        <User size={16} />
                      ) : (
                        <MessageSquare size={16} />
                      )}
                      <span className="sender-name">
                        {msg.message_type === 'user' ? 'You' : 'Shipsarthi Support'}
                      </span>
                    </div>
                    <span className="message-time">
                      {formatDate(msg.timestamp || msg.created_at || undefined)}
                    </span>
                  </div>
                  <div className="message-content">
                    {msg.message_content || msg.message || msg.comment}
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="message-attachments">
                      <span className="attachments-label">Attachments:</span>
                      <div className="attachments-list">
                        {msg.attachments.map((att, attIndex) => {
                          const attachmentKey = att._id || att.file_url || `${attIndex}`;
                          const isDownloading = downloadingAttachmentId === attachmentKey;
                          return (
                          <button
                            key={attachmentKey}
                            type="button"
                            className="attachment-link"
                            onClick={() => handleAttachmentDownload(att)}
                            disabled={isDownloading}
                          >
                            <Paperclip size={14} />
                            {isDownloading ? 'Downloading...' : att.file_name || `Attachment ${attIndex + 1}`}
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="no-messages">No messages yet</div>
            )}
          </div>
        </div>

        <div className="reply-section">
          <h3>Add Reply</h3>
          <textarea
            className="reply-input"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            rows={4}
          />
          <div className="file-upload-section">
            <input
              type="file"
              id="file-upload"
              multiple
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="file-upload-btn">
              <Paperclip size={16} /> Attach Files
            </label>
            {selectedFiles.length > 0 && (
              <div className="selected-files">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span>{file.name}</span>
                    <button onClick={() => removeFile(index)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button 
            className="send-btn" 
            onClick={handleSendMessage}
            disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
          >
            <Send size={16} />
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default TicketDetail;

