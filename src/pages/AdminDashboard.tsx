import { useState, useEffect, useRef, Fragment, type ReactNode } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Settings, LayoutDashboard, LogOut, Activity, ExternalLink, FileText, CheckCircle2, XCircle, MessageSquare, Send, Paperclip, Mail, User, Search, Download, X, UserCog, History, Reply, Upload, Link as LinkIcon } from 'lucide-react';
import { db } from '../lib/firebase';
// Replace your firestore import line with this:
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy, writeBatch, limit, getDocs, where } from 'firebase/firestore';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import ReportsDashboard from './ReportsDashboard';

interface ClinicConfig {
  times: { eyeCheck: number; contactLens: number };
  hours: { start: string; end: string };
  lunch: { start: string; end: string; enabled: boolean };
  weeklyOff: number[];
  openDates: string[];
  dailyOverrides: Record<string, { start: string; end: string }>;
  closedDates?: string[];
}

export default function AdminDashboard() {
  const [view, setView] = useState<'diary' | 'messages' | 'logs' | 'settings' | 'reports'>('diary');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({
    firstName: '', lastName: '', email: '', phone: '', dob: '', service: 'Eye Check', time: '', inFullTimeEducation: false, onBenefits: false, isDiabetic: false, familyGlaucoma: false
  });

  const [config, setConfig] = useState<ClinicConfig>({ 
    times: { eyeCheck: 30, contactLens: 20 }, 
    hours: { start: "09:00", end: "17:00" },
    lunch: { start: "13:00", end: "14:00", enabled: true },
    weeklyOff: [0], openDates: [], dailyOverrides: {}
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  const [logSearch, setLogSearch] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("All");
  const [logStatusFilter, setLogStatusFilter] = useState("All");

  // --- CRM & MESSAGES STATE ---
  const [crmPatients, setCrmPatients] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [selectedChatPatient, setSelectedChatPatient] = useState<any>(null);
  const [crmTab, setCrmTab] = useState<'chat' | 'ledger' | 'profile'>('chat');
  const [editProfileData, setEditProfileData] = useState({ patientName: '', email: '', phone: '', dob: '' });
  
  const [commsType, setCommsType] = useState<'SMS' | 'Email'>('SMS');
  const [outboundSMS, setOutboundSMS] = useState('');
  const [emailData, setEmailData] = useState({ subject: '', body: '', attachment: null as File | null });
  const [isSendingComms, setIsSendingComms] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<any>(null);

  // --- MANUAL MESSAGE STATES ---
  const [isManualMessageModalOpen, setIsManualMessageModalOpen] = useState(false);
  const [manualMsgType, setManualMsgType] = useState<'SMS' | 'Email'>('SMS');
  const [manualMsgData, setManualMsgData] = useState({ phone: '', email: '', name: '', subject: '', body: '' });
  const [isSendingManual, setIsSendingManual] = useState(false);

  // --- SEARCH & MODAL STATES ---
  const [patientSearch, setPatientSearch] = useState('');
  const [globalMessageSearch, setGlobalMessageSearch] = useState('');
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [newMessageSearch, setNewMessageSearch] = useState('');

  // --- CSV IMPORT & LINKING STATES ---
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState({ name: '', dob: '', phone: '', email: '' });
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState<{new: any[], duplicates: any[]} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [selectedCrmPatientForBooking, setSelectedCrmPatientForBooking] = useState<any>(null);
  const [updateCrmOnBook, setUpdateCrmOnBook] = useState(false);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [apptToLink, setApptToLink] = useState<any>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');

  const [cloudSearchResults, setCloudSearchResults] = useState<any[]>([]);

  const performCloudSearch = async (queryText: string) => {
    if (!queryText || queryText.length < 3) {
      setCloudSearchResults([]);
      return;
    }
    try {
      // 1. CLOUD SEARCH: Ask Firebase for Master CRM Records
      let q;
      if (queryText.startsWith('0') || queryText.startsWith('+')) {
        let phone = queryText.replace(/[\s\-\(\)]/g, '');
        if (phone.startsWith('0')) phone = `+44${phone.substring(1)}`;
        q = query(collection(db, "patients"), where("phone", ">=", phone), where("phone", "<=", phone + '\uf8ff'), limit(15));
      } else if (queryText.includes('@')) {
        const email = queryText.toLowerCase();
        q = query(collection(db, "patients"), where("email", ">=", email), where("email", "<=", email + '\uf8ff'), limit(15));
      } else {
        const nameTitleCase = queryText.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        q = query(collection(db, "patients"), where("patientName", ">=", nameTitleCase), where("patientName", "<=", nameTitleCase + '\uf8ff'), limit(15));
      }
      const snap = await getDocs(q as any);
const cloudMatches: any[] = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

      // 2. LOCAL SEARCH: Scan active memory for Online Bookings & Text Messages
      const queryLower = queryText.toLowerCase();
      
      const apptMatches = appointments.filter(a => 
        (a.patientName || '').toLowerCase().includes(queryLower) ||
        (a.email || '').toLowerCase().includes(queryLower) ||
        (a.phone || '').toLowerCase().includes(queryLower)
      ).map(a => ({ id: `unknown-${a.phone || a.email}`, patientName: a.patientName, phone: a.phone, email: a.email, dob: a.dob }));

      const msgMatches = chatMessages.filter(m => 
        (m.patientName || '').toLowerCase().includes(queryLower) ||
        (m.email || '').toLowerCase().includes(queryLower) ||
        (m.phone || '').toLowerCase().includes(queryLower)
      ).map(m => ({ id: `unknown-${m.phone || m.email}`, patientName: m.patientName, phone: m.phone, email: m.email }));

      // 3. MERGE & DEDUPLICATE: Combine both lists perfectly
      const mergedMap = new Map();
      
      // Master records take priority
      cloudMatches.forEach(p => {
         const key = p.phone || p.email || p.id;
         mergedMap.set(key, p);
      });

      // Add online bookings if they don't already exist
      apptMatches.forEach(p => {
         const key = p.phone || p.email;
         if (key && !mergedMap.has(key)) mergedMap.set(key, p);
      });

      // Add messaged patients if they don't already exist
      msgMatches.forEach(p => {
         const key = p.phone || p.email;
         if (key && !mergedMap.has(key)) mergedMap.set(key, p);
      });

      // Return the top 20 merged results
      setCloudSearchResults(Array.from(mergedMap.values()).slice(0, 20));
    } catch (e) {
      console.error("Search error", e);
    }
  };

  // --- SCROLLING ENGINES ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionUnreadMessageId, setSessionUnreadMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const queryStr = searchQuery.toLowerCase();
    const results = appointments.filter(app => {
      const dobFormatted = app.dob ? new Date(app.dob).toLocaleDateString('en-GB') : '';
      return (
        app.patientName?.toLowerCase().includes(queryStr) ||
        app.email?.toLowerCase().includes(queryStr) ||
        app.phone?.includes(queryStr) ||
        dobFormatted.includes(queryStr)
      );
    });
    results.sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
    setSearchResults(results);
    setCurrentResultIndex(0);
  }, [searchQuery, appointments]);

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    const unsubAppts = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qPatients = query(collection(db, "patients"), orderBy("createdAt", "desc"), limit(150));
const unsubPatients = onSnapshot(qPatients, (snap) => {
  setCrmPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

    const qLogs = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qMessages = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const loadSettings = async () => {
      const docRef = doc(db, "settings", "clinicConfig");
      const d = await getDoc(docRef);
      if (d.exists()) {
        const cloudData = d.data();
        setConfig(prev => ({
          ...prev,
          times: cloudData.times || prev.times,
          hours: cloudData.hours || prev.hours,
          lunch: {
            start: cloudData.lunch?.start || "13:00",
            end: cloudData.lunch?.end || "14:00",
            enabled: cloudData.lunch?.enabled ?? true
          },
          weeklyOff: cloudData.weeklyOff || prev.weeklyOff,
          openDates: cloudData.openDates || prev.openDates,
          dailyOverrides: cloudData.dailyOverrides || prev.dailyOverrides
        }));
        setClosedDates(cloudData.closedDates || []);
      }
    };
    loadSettings();
    return () => { unsubAppts(); unsubPatients(); unsubLogs(); unsubMessages(); };
  }, []);

  useEffect(() => {
    if (selectedChatPatient) {
      setEditProfileData({
        patientName: selectedChatPatient.patientName || '',
        email: selectedChatPatient.email || '',
        phone: selectedChatPatient.phone || '',
        dob: selectedChatPatient.dob || ''
      });
      setCrmTab('chat'); 
      setReplyingToMessage(null); 
    }
  }, [selectedChatPatient]);

  useEffect(() => {
    if (selectedChatPatient && view === 'messages' && crmTab === 'chat' && commsType === 'SMS') {
      const unreadMsgs = chatMessages.filter(m => 
        m.direction === 'inbound' && 
        !m.isRead && 
        ((m.phone && m.phone === selectedChatPatient.phone) || (m.email && m.email === selectedChatPatient.email))
      );

      if (unreadMsgs.length > 0) {
        setSessionUnreadMessageId(unreadMsgs[0].id);
        setTimeout(() => {
          const divider = document.getElementById(`unread-divider-${unreadMsgs[0].id}`);
          if (divider) divider.scrollIntoView({ behavior: 'instant', block: 'center' });
        }, 100);

        unreadMsgs.forEach(async (msg) => {
          try {
            await setDoc(doc(db, "messages", msg.id), { isRead: true }, { merge: true });
          } catch (e) { console.error("Failed to mark read", e); }
        });
      } else {
        setSessionUnreadMessageId(null);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        }, 100);
      }
    }
  }, [selectedChatPatient?.id, view, crmTab, commsType]);

  // --- CSV PARSING & ANALYSIS ENGINE ---
  const parseCSV = (str: string) => {
    const arr: string[][] = [];
    let quote = false;
    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
        if (cc === '"') { quote = !quote; continue; }
        if (cc === ',' && !quote) { ++col; continue; }
        if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc === '\n' && !quote) { ++row; col = 0; continue; }
        if (cc === '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr;
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text).map(r => r.map(c => c.trim()));
      if (rows.length > 0) {
        setCsvHeaders(rows[0]);
        setCsvData(rows.slice(1).filter(r => r.some(c => c))); 
      }
    };
    reader.readAsText(file);
  };

  const standardizeDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
       const yyyy = parsedDate.getFullYear();
       const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
       const dd = String(parsedDate.getDate()).padStart(2, '0');
       return `${yyyy}-${mm}-${dd}`;
    }
    return dateStr;
  };

  const standardizePhone = (phoneStr: string) => {
    if (!phoneStr) return '';
    let clean = phoneStr.replace(/[\s\-\(\)]/g, '');
    if (clean.startsWith('0')) {
      clean = `+44${clean.substring(1)}`;
    } else if (clean.startsWith('44')) {
      clean = `+44${clean.substring(2)}`;
    } else if (!clean.startsWith('+44') && clean.length >= 10) {
      clean = `+44${clean}`;
    }
    return clean;
  };

  const analyzeCsvData = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const newPts: any[] = [];
      const dupPts: any[] = [];

      const nameIdx = csvHeaders.indexOf(csvMapping.name);
      const dobIdx = csvHeaders.indexOf(csvMapping.dob);
      const phoneIdx = csvHeaders.indexOf(csvMapping.phone);
      const emailIdx = csvHeaders.indexOf(csvMapping.email);

      for (const row of csvData) {
        const name = nameIdx !== -1 ? row[nameIdx] : '';
        const rawDob = dobIdx !== -1 ? row[dobIdx] : '';
        const rawPhone = phoneIdx !== -1 ? row[phoneIdx] : '';
        const rawEmail = emailIdx !== -1 ? row[emailIdx] : '';

        if (!name && !rawPhone && !rawEmail) continue;

        const formattedPhone = standardizePhone(rawPhone);
        const formattedDob = standardizeDate(rawDob);
        const formattedEmail = rawEmail.toLowerCase();

        // Check for duplicates in the current CRM
        const existing = crmPatients.find(p => 
          (formattedPhone && p.phone === formattedPhone) || 
          (formattedEmail && p.email === formattedEmail)
        );

        if (existing) {
           dupPts.push({
              existingId: existing.id,
              name: name || existing.patientName,
              phone: formattedPhone || existing.phone,
              email: formattedEmail || existing.email,
              dob: formattedDob || existing.dob
           });
        } else {
           newPts.push({
              name,
              phone: formattedPhone,
              email: formattedEmail,
              dob: formattedDob
           });
        }
      }

      setImportAnalysis({ new: newPts, duplicates: dupPts });
      setIsAnalyzing(false);
    }, 500); // Small timeout to allow UI to render spinner for large datasets
  };

  const processBatchedImport = async () => {
    if (!importAnalysis) return;
    setIsImporting(true);
    setImportProgress('Preparing data...');

    try {
      const allOperations = [
        ...importAnalysis.new.map(p => ({ type: 'new', data: p })),
        ...importAnalysis.duplicates.map(p => ({ type: 'merge', data: p }))
      ];

      // Firebase limits batches to 500 operations. We use 490 to be safe.
      const CHUNK_SIZE = 490;
      
      for (let i = 0; i < allOperations.length; i += CHUNK_SIZE) {
        const currentChunk = i + CHUNK_SIZE > allOperations.length ? allOperations.length : i + CHUNK_SIZE;
        setImportProgress(`Saving ${currentChunk} of ${allOperations.length} records...`);
        
        const chunk = allOperations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const op of chunk) {
           if (op.type === 'new') {
              const newRef = doc(collection(db, "patients"));
              batch.set(newRef, {
                 patientName: op.data.name,
                 phone: op.data.phone,
                 email: op.data.email,
                 dob: op.data.dob,
                 createdAt: serverTimestamp(),
                 imported: true
              });
           } else {
              const existRef = doc(db, "patients", op.data.existingId);
              // Merge to prevent overwriting existing data with blanks
              batch.set(existRef, {
                 ...(op.data.name && { patientName: op.data.name }),
                 ...(op.data.phone && { phone: op.data.phone }),
                 ...(op.data.email && { email: op.data.email }),
                 ...(op.data.dob && { dob: op.data.dob }),
                 imported: true
              }, { merge: true });
           }
        }
        await batch.commit();
      }

      alert(`Success! Imported ${importAnalysis.new.length} new patients and safely merged ${importAnalysis.duplicates.length} duplicate records.`);
      setIsCsvModalOpen(false);
      setCsvFile(null);
      setCsvHeaders([]);
      setCsvData([]);
      setCsvMapping({ name: '', dob: '', phone: '', email: '' });
      setImportAnalysis(null);
      setImportProgress('');
    } catch (err) {
      console.error(err);
      alert("Error importing CSV data. Please try breaking your file into smaller chunks.");
    }
    setIsImporting(false);
  };

  const handleUpdateMasterProfile = async () => {
    if (!selectedChatPatient) return;
    
    const patientAppts = appointments.filter(a => 
      (a.patientId && a.patientId === selectedChatPatient.id) ||
      (a.phone && a.phone === selectedChatPatient.phone) || 
      (a.email && a.email === selectedChatPatient.email)
    );

    try {
      const isKnownCrmId = selectedChatPatient.id && !selectedChatPatient.id.startsWith('unknown-');
      let currentMasterId = selectedChatPatient.id;

      if (!isKnownCrmId) {
        const newPatientRef = await addDoc(collection(db, "patients"), {
          patientName: editProfileData.patientName,
          email: editProfileData.email,
          phone: editProfileData.phone,
          dob: editProfileData.dob,
          createdAt: serverTimestamp()
        });
        currentMasterId = newPatientRef.id;
      } else {
        await setDoc(doc(db, "patients", currentMasterId), {
          patientName: editProfileData.patientName,
          email: editProfileData.email,
          phone: editProfileData.phone,
          dob: editProfileData.dob
        }, { merge: true });
      }

      for (const app of patientAppts) {
        await setDoc(doc(db, "appointments", app.id), {
          patientName: editProfileData.patientName,
          email: editProfileData.email,
          phone: editProfileData.phone,
          dob: editProfileData.dob,
          patientId: currentMasterId
        }, { merge: true });
      }

      setSelectedChatPatient({ ...selectedChatPatient, ...editProfileData, id: currentMasterId });
      alert("Master patient record and all associated appointments have been successfully synchronised!");
    } catch (err) {
      alert("Failed to update master patient record.");
    }
  };

  const writeLog = async (type: 'Email' | 'SMS', patientName: string, contactInfo: string, status: 'Sent' | 'Failed', action: string, apptDate: string, apptTime: string, errorMsg = '') => {
    try {
      await addDoc(collection(db, "logs"), {
        type, patientName, contactInfo, status, action, apptDate, apptTime, errorMsg, timestamp: serverTimestamp()
      });
    } catch (e) { console.error("Failed to write log", e); }
  };

  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const fromMins = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  };

  const calculateAge = (dobString: string) => {
    if (!dobString) return 0;
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const calculateSlotsForDate = (targetDate: string) => {
    const dayHours = config.dailyOverrides?.[targetDate] || config.hours;
    const startMins = toMins(dayHours.start);
    const endMins = toMins(dayHours.end);

    const isLunchEnabled = config.lunch?.enabled ?? true;
    const lunchStartMins = toMins(config.lunch?.start || "13:00");
    const lunchEndMins = toMins(config.lunch?.end || "14:00");

    const duration = newBooking.service === 'Eye Check' ? config.times.eyeCheck : config.times.contactLens;
    const slots: string[] = [];

    const now = new Date();
    const localDateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const isToday = targetDate === localDateStr;
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    const dayBookings = appointments
      .filter(b => b.appointmentDate === targetDate)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });

    for (let current = startMins; current + duration <= endMins; current += duration) {
      const potentialEnd = current + duration;
      
      if (isToday && current <= currentMins) continue;

      const overlapsLunch = isLunchEnabled && (current < lunchEndMins && potentialEnd > lunchStartMins);
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));

      if (!overlapsLunch && !isOverlap) {
        slots.push(fromMins(current));
      }
    }
    return slots;
  };

  const handleSendSMS = async () => {
    if (!outboundSMS.trim() || !selectedChatPatient?.phone) return;
    setIsSendingComms(true);
    try {
      const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selectedChatPatient.phone, body: outboundSMS, isCustomChat: true })
      });
      if (res.ok) {
        await addDoc(collection(db, "messages"), {
          phone: selectedChatPatient.phone,
          patientName: selectedChatPatient.patientName,
          text: outboundSMS,
          direction: 'outbound',
          type: 'sms',
          timestamp: serverTimestamp()
        });
        await writeLog('SMS', selectedChatPatient.patientName, selectedChatPatient.phone, 'Sent', 'Direct Chat Message', new Date().toISOString().split('T')[0], '');
        setOutboundSMS('');
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
         alert("Failed to send SMS via Twilio.");
      }
    } catch (e) { console.error(e); alert("Network error sending SMS."); }
    setIsSendingComms(false);
  };

  const handleSendEmail = async () => {
    if (!emailData.body.trim() || !selectedChatPatient?.email) return;
    setIsSendingComms(true);
    try {
       let attachmentBase64 = null;
       let attachmentName = null;
       let attachmentType = null;
       
       if (emailData.attachment) {
          const reader = new FileReader();
          reader.readAsDataURL(emailData.attachment);
          await new Promise((resolve) => {
             reader.onload = () => {
                attachmentBase64 = (reader.result as string).split(',')[1];
                attachmentName = emailData.attachment?.name;
                attachmentType = emailData.attachment?.type;
                resolve(null);
             };
          });
       }

       const payload: any = {
          type: "send_email",
          templateId: 7, 
          to_email: selectedChatPatient.email,
          patient_name: selectedChatPatient.patientName.split(' ')[0],
          subject: emailData.subject,
          params: {
            patient_name: selectedChatPatient.patientName.split(' ')[0],
            custom_message: emailData.body,
            subject: emailData.subject 
          }
       };
       
       if (replyingToMessage?.messageId) {
           payload.inReplyTo = replyingToMessage.messageId;
       }
       
       if (attachmentBase64) {
          payload.attachment = [{ name: attachmentName, content: attachmentBase64 }];
       }

       const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
         method: "POST", headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
       });

       if (res.ok) {
         await writeLog('Email', selectedChatPatient.patientName, selectedChatPatient.email, 'Sent', `Direct Email: ${emailData.subject}`, new Date().toISOString().split('T')[0], '');
         
         await addDoc(collection(db, "messages"), {
            phone: selectedChatPatient.phone || '',
            email: selectedChatPatient.email || '',
            patientName: selectedChatPatient.patientName,
            text: `Subject: ${emailData.subject}\n\n${emailData.body}`,
            attachmentName: attachmentName || null,
            attachmentBase64: attachmentBase64 || null,
            attachmentType: attachmentType || null,
            direction: 'outbound',
            type: 'email',
            inReplyTo: payload.inReplyTo || null,
            timestamp: serverTimestamp()
         });

         setEmailData({ subject: '', body: '', attachment: null });
         setReplyingToMessage(null); 
         alert("Email sent successfully!");
         setCrmTab('chat');
         setCommsType('SMS');
         setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
       } else {
         alert("Failed to send email via Brevo.");
       }
    } catch(e) { console.error(e); alert("Network error sending email."); }
    setIsSendingComms(false);
  };

  const handleSendManualMessage = async () => {
    setIsSendingManual(true);
    try {
      if (manualMsgType === 'SMS') {
        const fullPhone = `+44${manualMsgData.phone}`;
        const fullSms = `${manualMsgData.body}\n\nThe Eye Centre, Leicester`;
        const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: fullPhone, body: fullSms, isCustomChat: true })
        });
        if (res.ok) {
          await addDoc(collection(db, "messages"), {
            phone: fullPhone,
            patientName: manualMsgData.name || "Unknown Patient",
            text: fullSms,
            direction: 'outbound',
            type: 'sms',
            timestamp: serverTimestamp()
          });
          await writeLog('SMS', manualMsgData.name || 'Manual Recipient', fullPhone, 'Sent', 'Manual Dashboard SMS', new Date().toISOString().split('T')[0], '');
          alert("SMS Sent Successfully!");
          setIsManualMessageModalOpen(false);
          setManualMsgData({ phone: '', email: '', name: '', subject: '', body: '' });
        } else {
          alert("Failed to send SMS.");
        }
      } else {
        const payload = {
          type: "send_email",
          templateId: 7,
          to_email: manualMsgData.email,
          patient_name: manualMsgData.name || "Patient",
          subject: manualMsgData.subject,
          params: {
            patient_name: manualMsgData.name || "Patient",
            custom_message: manualMsgData.body,
            subject: manualMsgData.subject
          }
        };
        const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          await writeLog('Email', manualMsgData.name || 'Manual Recipient', manualMsgData.email, 'Sent', `Manual Email: ${manualMsgData.subject}`, new Date().toISOString().split('T')[0], '');
          await addDoc(collection(db, "messages"), {
            email: manualMsgData.email,
            patientName: manualMsgData.name || manualMsgData.email,
            text: `Subject: ${manualMsgData.subject}\n\n${manualMsgData.body}`,
            direction: 'outbound',
            type: 'email',
            timestamp: serverTimestamp()
          });
          alert("Email Sent Successfully!");
          setIsManualMessageModalOpen(false);
          setManualMsgData({ phone: '', email: '', name: '', subject: '', body: '' });
        } else {
          alert("Failed to send Email.");
        }
      }
    } catch(e) {
      console.error(e);
      alert("Network error.");
    }
    setIsSendingManual(false);
  };

  const handleAdminBooking = async () => {
    try {
      const rawPhone = newBooking.phone.trim();
      const formattedPhone = rawPhone ? (rawPhone.startsWith('0') ? `+44${rawPhone.substring(1)}` : rawPhone) : '';
  
      const age = calculateAge(newBooking.dob);
      let category = 'Eye Check Private';
      
      if (newBooking.service === 'Contact Lens Check') {
        category = 'Contact Lens Check';
      } else {
        if (age >= 60) category = 'Eye Check Over 60';
        else if (age < 16) category = 'Eye Check Child';
        else if (age <= 18 && newBooking.inFullTimeEducation) category = 'Eye Check NHS';
        else if (newBooking.onBenefits || newBooking.isDiabetic || (age >= 40 && newBooking.familyGlaucoma)) category = 'Eye Check NHS';
      }

      const generatedNotes = [
        newBooking.inFullTimeEducation ? "In full-time education" : "",
        newBooking.onBenefits ? "Receiving income-related benefits" : "",
        newBooking.isDiabetic ? "Diabetic" : "",
        newBooking.familyGlaucoma ? "Family history of Glaucoma" : ""
      ].filter(Boolean).join(", ");
  
      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${newBooking.firstName} ${newBooking.lastName}`,
        email: newBooking.email,
        phone: formattedPhone,
        dob: newBooking.dob,
        appointmentType: category,
        appointmentDate: selectedDate,
        appointmentTime: newBooking.time,
        source: 'Admin',
        patientId: selectedCrmPatientForBooking ? selectedCrmPatientForBooking.id : null,
        isDiabetic: newBooking.isDiabetic,
        onBenefits: newBooking.onBenefits,
        familyGlaucoma: newBooking.familyGlaucoma,
        inFullTimeEducation: newBooking.inFullTimeEducation,
        notes: generatedNotes,
        createdAt: serverTimestamp()
      });

      if (selectedCrmPatientForBooking && updateCrmOnBook) {
         await setDoc(doc(db, "patients", selectedCrmPatientForBooking.id), {
            patientName: `${newBooking.firstName} ${newBooking.lastName}`,
            email: newBooking.email,
            phone: formattedPhone,
            dob: newBooking.dob
         }, { merge: true });
      }

      const manageLink = `${window.location.origin}/manage/${docRef.id}`;
      const receiptLink = `${window.location.origin}/receipt/${docRef.id}`;
  
      if (newBooking.email) {
        try {
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "send_email", templateId: 1, to_email: newBooking.email, patient_name: newBooking.firstName,
              params: { patient_name: newBooking.firstName, appointment_type: category, date: new Date(selectedDate).toLocaleDateString('en-GB'), time: newBooking.time, manage_link: manageLink }
            })
          });
          if (res.ok) await writeLog('Email', newBooking.firstName, newBooking.email, 'Sent', 'Booking Confirmation', selectedDate, newBooking.time);
          else await writeLog('Email', newBooking.firstName, newBooking.email, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'API Error');
        } catch (emailErr) {
          await writeLog('Email', newBooking.firstName, newBooking.email, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'Network Error');
        }
      }
  
      if (formattedPhone && formattedPhone.length > 5) {
        let smsMessage = `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is scheduled for ${new Date(selectedDate).toLocaleDateString('en-GB')} @ ${newBooking.time}.\nOur expert team look forward to providing you with exceptional care.\n\nFor any enquiries, please reply to this message or call 0116 253 2788.\nThe Eye Centre, Leicester`;

        if (!newBooking.email) {
          smsMessage = `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is booked for ${new Date(selectedDate).toLocaleDateString('en-GB')} @ ${newBooking.time}.\n\nTo receive your full digital receipt and manage your booking online, please tap here to securely add your email address: ${receiptLink}`;
        }

        try {
          const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: formattedPhone, body: smsMessage })
          });
          if (smsRes.ok) {
            await writeLog('SMS', newBooking.firstName, formattedPhone, 'Sent', 'Booking Confirmation', selectedDate, newBooking.time);
          }
        } catch(e) {
          await writeLog('SMS', newBooking.firstName, formattedPhone, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'Network Error');
        }
      }
  
      setIsBookingModalOpen(false);
      setSelectedCrmPatientForBooking(null);
      setBookingSearchQuery('');
      setUpdateCrmOnBook(false);
      setNewBooking({
        firstName: '', lastName: '', email: '', phone: '', dob: '', service: 'Eye Check', time: '', inFullTimeEducation: false, onBenefits: false, isDiabetic: false, familyGlaucoma: false
      });
      alert("Appointment successfully booked and linked!");
    } catch (err) {
      console.error("Booking Error:", err);
      alert("Error saving booking.");
    }
  };

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    let newIndex = direction === 'next' ? currentResultIndex + 1 : currentResultIndex - 1;
    if (newIndex >= searchResults.length) newIndex = 0;
    if (newIndex < 0) newIndex = searchResults.length - 1;
    setCurrentResultIndex(newIndex);
    const targetDate = searchResults[newIndex].appointmentDate;
    setSelectedDate(targetDate);
  };

  const isDateClosed = () => {
    const dateObj = new Date(selectedDate);
    const dayOfWeek = dateObj.getDay(); 
    const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);
    const isManuallyOpened = config.openDates?.includes(selectedDate);
    const isManuallyClosed = closedDates.includes(selectedDate);
    return isManuallyClosed || (isWeeklyOff && !isManuallyOpened);
  };

  const deleteApp = async (bookingData: any) => {
    if (window.confirm("Are you sure you want to cancel this appointment and notify the patient?")) {
      try {
        if (bookingData.email) {
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "send_email", templateId: 3, to_email: bookingData.email, patient_name: bookingData.patientName.split(' ')[0],
              params: { patient_name: bookingData.patientName.split(' ')[0], date: new Date(bookingData.appointmentDate).toLocaleDateString('en-GB'), time: bookingData.appointmentTime }
            })
          });
          if (res.ok) await writeLog('Email', bookingData.patientName, bookingData.email, 'Sent', 'Cancellation', bookingData.appointmentDate, bookingData.appointmentTime);
        }

        if (bookingData.phone) {
          const cancelMsg = `Cancellation: ${bookingData.patientName.split(' ')[0]}, your appointment on ${new Date(bookingData.appointmentDate).toLocaleDateString('en-GB')} @ ${bookingData.appointmentTime} has been cancelled. The Eye Centre.`;
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: bookingData.phone,
              body: cancelMsg,
              cancelSid: bookingData.reminderSid
            })
          });
          if (res.ok) {
            await writeLog('SMS', bookingData.patientName, bookingData.phone, 'Sent', 'Cancellation', bookingData.appointmentDate, bookingData.appointmentTime);
          }
        }

        await deleteDoc(doc(db, "appointments", bookingData.id));
      } catch (err) {
        alert("Failed to delete appointment.");
      }
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const appRef = doc(db, "appointments", id);
      const appSnap = await getDoc(appRef);
      const appData = appSnap.data();

      if (appData) {
        if (newStatus === 'FTA' && appData.status !== 'FTA') {
          await fetch("https://twilio.yaseen-hussain18.workers.dev/schedule-fta", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appointmentId: id,
              email: appData.email || null,
              phone: appData.phone || null,
              patientFirstName: appData.patientName.split(' ')[0],
              manageLink: `${window.location.origin}/manage/${id}`
            })
          });
        }
      }

      await setDoc(appRef, { status: newStatus }, { merge: true });
      
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Arrived': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'In Progress': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Visit Complete': return 'bg-green-100 text-green-700 border-green-200';
      case 'FTA': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const updateAppointment = async () => {
    if (!editingApp) return;
    try {
      const rawPhone = editingApp.phone.trim();
      const formattedPhone = rawPhone ? (rawPhone.startsWith('0') ? `+44${rawPhone.substring(1)}` : rawPhone) : '';
  
      const appRef = doc(db, "appointments", editingApp.id);
      
      await setDoc(appRef, {
        patientName: editingApp.patientName,
        email: editingApp.email,
        phone: formattedPhone,
        dob: editingApp.dob,
        appointmentTime: editingApp.appointmentTime,
        appointmentDate: editingApp.appointmentDate,
        notes: editingApp.notes || "" 
      }, { merge: true });
  
      setEditingApp(null);
      alert("Patient details updated successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to update appointment.");
    }
  };

  const handleDrop = async (e: React.DragEvent, newTime: string) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (!appointmentId) return;
    try {
      const appRef = doc(db, "appointments", appointmentId);
      await setDoc(appRef, { appointmentTime: newTime }, { merge: true });
    } catch (err) {
      alert("Failed to move appointment.");
    }
  };

  const toggleDayStatus = async (date: string) => {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);

    let newClosed = [...closedDates];
    let newOpen = [...(config.openDates || [])];

    if (isWeeklyOff) {
      newOpen = newOpen.includes(date) ? newOpen.filter(d => d !== date) : [...newOpen, date];
    } else {
      newClosed = newClosed.includes(date) ? newClosed.filter(d => d !== date) : [...newClosed, date];
    }

    setClosedDates(newClosed);
    const updatedConfig = { ...config, openDates: newOpen, closedDates: newClosed };
    setConfig(updatedConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), updatedConfig, { merge: true });
  };

  const updateDailyHours = async (start: string, end: string) => {
    const newOverrides = { ...config.dailyOverrides, [selectedDate]: { start, end } };
    const newConfig = { ...config, dailyOverrides: newOverrides };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

  const toggleWeeklyDay = async (dayIndex: number) => {
    let newWeeklyOff = [...config.weeklyOff];
    newWeeklyOff = newWeeklyOff.includes(dayIndex) ? newWeeklyOff.filter(d => d !== dayIndex) : [...newWeeklyOff, dayIndex];
    const newConfig = { ...config, weeklyOff: newWeeklyOff };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

  const saveConfig = async () => {
    try {
      await setDoc(doc(db, "settings", "clinicConfig"), config);
      alert("Clinic settings saved to database!");
    } catch (err) { alert("Error saving settings."); }
  };

  const renderGrid = () => {
    const grid: ReactNode[] = [];
    const dayHours = config.dailyOverrides?.[selectedDate] || config.hours;
    const startMins = toMins(dayHours.start);
    const endMins = toMins(dayHours.end);

    const isLunchEnabled = config.lunch?.enabled ?? true;
    const lunchStartMins = toMins(config.lunch?.start || "13:00");
    const lunchEndMins = toMins(config.lunch?.end || "14:00");
    
    for (let time = startMins; time < endMins; time += 5) {
      const timeStr = fromMins(time);
      const isLunchSlot = isLunchEnabled && (time >= lunchStartMins && time < lunchEndMins);
      const booking = appointments.find((a: any) => a.appointmentDate === selectedDate && a.appointmentTime === timeStr);
  
      const isGridLine = time % config.times.eyeCheck === 0;

      if (booking || isGridLine) {
        const duration = booking 
          ? (booking.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck)
          : 0;
        const endTimeStr = booking ? fromMins(time + duration) : '';

        const isHighlighted = searchResults.length > 0 && booking && searchResults[currentResultIndex]?.id === booking.id;
  
        grid.push(
          <div key={timeStr} className={`flex items-start py-3 transition-colors border-b-2 border-slate-100 ${isLunchSlot ? 'bg-orange-50/20' : 'hover:bg-slate-50/50'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, timeStr)}>
            <div className="w-20 text-xs font-black text-slate-400 tabular-nums mt-3 pl-2">
              {timeStr}
              {isLunchSlot && <span className="block text-[8px] text-orange-400 uppercase font-bold mt-1">Lunch</span>}
            </div>
            <div className="flex-1 px-4">
              {booking ? (
                <div draggable onDragStart={(e) => e.dataTransfer.setData("appointmentId", booking.id)} className={`relative p-4 rounded-xl flex justify-between items-center shadow-sm cursor-move transition-all duration-500 ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 border-l-4 border-yellow-500 shadow-lg scale-[1.01] z-10' : 'bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185]'}`}>
                  {isHighlighted && (
                    <div className="absolute -top-3 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-2 py-1 rounded-full shadow-sm animate-bounce z-20">RESULT {currentResultIndex + 1}/{searchResults.length}</div>
                  )}
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] font-black text-[#3F9185] bg-teal-50 px-2.5 py-1 rounded-md tabular-nums border border-[#3F9185]/10">{timeStr} — {endTimeStr}</span>
                        <p className="font-bold text-slate-800 text-base">{booking.patientName}</p>
                        {booking.patientId && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-black rounded uppercase tracking-wider ml-1" title="Linked to CRM Profile">Linked</span>}
                      </div>
                      <div className="flex items-center gap-2">
                         <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider ${booking.source === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{booking.source === 'Admin' ? 'Admin' : 'Online'}</span>
                         <select value={booking.status || 'Booked'} onChange={(e) => updateStatus(booking.id, e.target.value)} className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border cursor-pointer outline-none transition-colors appearance-none text-center ${getStatusColor(booking.status || 'Booked')}`} onClick={(e) => e.stopPropagation()}>
                           <option value="Booked">Booked</option><option value="Arrived">Arrived</option><option value="In Progress">In Progress</option><option value="Visit Complete">Completed</option><option value="FTA">FTA</option>
                         </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-1">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase">DOB:</span>
                        <span className="text-[11px] font-bold text-slate-600">{booking.dob || 'N/A'}</span>
                        <span className="text-[10px] font-medium text-slate-400 border-l border-slate-200 pl-1.5 ml-1">Age: {calculateAge(booking.dob)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${booking.appointmentType?.includes('Contact') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{booking.appointmentType || 'Routine Eye Check'}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 ml-1 pt-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">E:</span> {booking.email ? booking.email : <span className="text-orange-400 italic">No email provided</span>}</span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">T:</span> {booking.phone ? booking.phone : <span className="text-orange-400 italic">No phone provided</span>}</span>
                    </div>
                    {booking.notes && (
                      <div className="ml-1 pt-2">
                        <div className="bg-yellow-50/70 border border-yellow-100/50 rounded-lg p-2.5 shadow-sm">
                          <p className="text-[11px] font-medium text-slate-600 leading-snug">
                            <span className="font-black text-yellow-600 uppercase tracking-wider mr-1">Notes:</span> 
                            {booking.notes}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 border-l border-slate-100 pl-4">
                    {!booking.patientId && (
                       <button onClick={() => { setApptToLink(booking); setIsLinkModalOpen(true); }} className="text-slate-300 hover:text-indigo-500 p-2 hover:bg-indigo-50 rounded-full transition-colors" title="Link to Master CRM Record"><LinkIcon size={18} /></button>
                    )}
                    <button onClick={() => {
                      setSelectedChatPatient(booking);
                      setView('messages');
                    }} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full transition-colors" title="Message Patient"><MessageSquare size={18} /></button>
                    <button onClick={() => setEditingApp(booking)} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full transition-colors" title="Edit"><Settings size={18} /></button>
                    <button onClick={() => deleteApp(booking)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                    <button onClick={() => window.open(`/manage/${booking.id}`, '_blank')} className="text-slate-300 hover:text-blue-500 p-2 hover:bg-blue-50 rounded-full transition-colors" title="Manage Booking"><ExternalLink size={18} /></button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    if (!isLunchSlot && !isDateClosed()) {
                      setNewBooking({
                        firstName: '', lastName: '', email: '', phone: '', dob: '', 
                        service: 'Eye Check', time: timeStr, 
                        inFullTimeEducation: false, onBenefits: false, isDiabetic: false, familyGlaucoma: false
                      });
                      setIsBookingModalOpen(true);
                    }
                  }}
                  disabled={isLunchSlot || isDateClosed()}
                  className={`min-h-[5rem] w-full rounded-xl border-2 border-dashed transition-all flex items-center justify-center group ${isLunchSlot ? 'border-orange-200/50 bg-orange-50/30 cursor-not-allowed' : 'border-slate-200 hover:border-[#3F9185]/50 hover:bg-[#3F9185]/5 cursor-pointer shadow-sm hover:shadow-md'}`}
                >
                   <span className={`text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${isLunchSlot ? 'text-orange-300 opacity-100' : 'text-[#3F9185] opacity-0 group-hover:opacity-100'}`}>
                     {isLunchSlot ? 'Lunch Break' : `+ Book ${timeStr} Appointment`}
                   </span>
                </button>
              )}
            </div>
          </div>
        );
      }
    }
    return grid;
  };

  const handlePreviousDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const handleNextDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const handleToday = () => {
    const d = new Date();
    const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    setSelectedDate(localDate.toISOString().split('T')[0]);
  };

  // --- OMNICHANNEL CRM SORTING ENGINE ---
  const sidebarPatientsMap = new Map();

  crmPatients.forEach(p => {
     sidebarPatientsMap.set(p.id, { ...p });
  });

  const findCrmPatient = (contactInfo: {phone?: string, email?: string}) => {
     return crmPatients.find(p => (contactInfo.phone && p.phone === contactInfo.phone) || (contactInfo.email && p.email === contactInfo.email));
  };

  const allContactsMap = new Map();
  appointments.forEach(app => {
    const key = app.phone || app.email;
    if (key && !allContactsMap.has(key)) {
      allContactsMap.set(key, app);
    }
  });
  const allContacts = Array.from(allContactsMap.values());

  allContacts.forEach(contact => {
    const crmP = findCrmPatient(contact);
    if (!crmP) {
       const key = contact.phone || contact.email;
       if (key && !sidebarPatientsMap.has(key)) sidebarPatientsMap.set(key, { ...contact, id: `unknown-${key}` });
    }
  });

  chatMessages.forEach(msg => {
    const crmP = findCrmPatient(msg);
    if (!crmP) {
       const key = msg.phone || msg.email;
       if (key && !sidebarPatientsMap.has(key)) {
         sidebarPatientsMap.set(key, {
           id: `unknown-${key}`,
           patientName: msg.patientName && msg.patientName !== 'Patient Reply' ? msg.patientName : 'Unknown Sender',
           phone: msg.phone || '',
           email: msg.email || ''
         });
       }
    }
  });

  const patientStats = new Map();
  let totalUnreadMessages = 0;

  chatMessages.forEach(msg => {
     const crmP = findCrmPatient(msg);
     const key = crmP ? crmP.id : (msg.phone || msg.email);
     if (!key) return;

     if (!patientStats.has(key)) patientStats.set(key, { unread: 0, lastTime: 0 });
     const stats = patientStats.get(key);

     if (msg.direction === 'inbound' && !msg.isRead) {
       stats.unread += 1;
       totalUnreadMessages += 1;
     }

     const msgTime = msg.timestamp?.seconds || 0;
     if (msgTime > stats.lastTime) stats.lastTime = msgTime;
  });

  const finalSidebarList = Array.from(sidebarPatientsMap.values()).sort((a, b) => {
     const statsA = patientStats.get(a.id) || patientStats.get(a.phone) || patientStats.get(a.email) || { unread: 0, lastTime: 0 };
     const statsB = patientStats.get(b.id) || patientStats.get(b.phone) || patientStats.get(b.email) || { unread: 0, lastTime: 0 };

     if (statsA.unread > 0 && statsB.unread === 0) return -1;
     if (statsB.unread > 0 && statsA.unread === 0) return 1;

     if (statsB.lastTime !== statsA.lastTime) {
        return statsB.lastTime - statsA.lastTime;
     }
     return (a.patientName || '').localeCompare(b.patientName || '');
  });

  const activePatientLedger = selectedChatPatient 
    ? appointments
        .filter(a => 
          (a.patientId && a.patientId === selectedChatPatient.id) ||
          (a.phone && a.phone === selectedChatPatient.phone) || 
          (a.email && a.email === selectedChatPatient.email)
        )
        .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
    : [];

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualMsgData.email);
  const isSmsValid = manualMsgData.phone.length >= 10 && manualMsgData.body.trim().length > 0;
  const isManualValid = manualMsgType === 'SMS' 
    ? isSmsValid 
    : (isEmailValid && manualMsgData.body.trim().length > 0 && manualMsgData.subject.trim().length > 0);

  return (
    <div className="min-h-screen p-6 bg-[#f8fafc]">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <div className="flex gap-2">
            <button onClick={() => setView('diary')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'diary' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutDashboard size={18} /> Diary
            </button>
            <button onClick={() => setView('messages')} className={`relative px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'messages' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <User size={18} /> CRM & Patients
              {totalUnreadMessages > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md border-2 border-white animate-in zoom-in">
                    {totalUnreadMessages}
                 </span>
              )}
            </button>
            <button onClick={() => setView('logs')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'logs' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <FileText size={18} /> Logs
            </button>
            <button onClick={() => setView('settings')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'settings' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Settings size={18} /> Settings
            </button>
            <button onClick={() => setView('reports')} className={`relative px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'reports' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Activity size={18} /> Analytics
            </button>
          </div>
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500">
            <LogOut size={20}/>
          </button>
        </div>

        {/* --- DIARY VIEW --- */}
        {view === 'diary' && (
          <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><CalendarIcon className="text-[#3F9185]" /> Daily Grid</h2>
                <button onClick={() => setIsBookingModalOpen(true)} className="bg-[#3F9185] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all shadow-md">+ New Booking</button>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                <button onClick={handlePreviousDay} className="px-3 py-2 bg-white rounded-xl font-bold text-slate-500 hover:text-[#3F9185] hover:shadow-sm transition-all text-xs uppercase">&larr; Prev</button>
                <button onClick={handleToday} className="px-4 py-2 bg-[#3F9185]/10 rounded-xl font-black text-[#3F9185] hover:bg-[#3F9185]/20 transition-all text-xs uppercase">Today</button>
                <button onClick={handleNextDay} className="px-3 py-2 bg-white rounded-xl font-bold text-slate-500 hover:text-[#3F9185] hover:shadow-sm transition-all text-xs uppercase">Next &rarr;</button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-2 bg-transparent font-black text-[#3F9185] outline-none cursor-pointer text-sm" />
              </div>
            </div>

            <div className="bg-white p-2 rounded-2xl border border-slate-100 mb-6 flex items-center justify-between gap-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-3 flex-1 bg-slate-50 p-3 rounded-xl transition-all focus-within:ring-2 focus-within:ring-[#3F9185]/20">
                <span className="text-slate-400">🔍</span>
                <input type="text" placeholder="Search patient name, email, phone..." className="bg-transparent outline-none w-full font-bold text-slate-700 placeholder:font-medium placeholder:text-slate-400 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 font-bold text-xs">CLEAR</button>}
              </div>
              {searchResults.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-800 text-white pl-4 pr-2 py-2 rounded-xl shadow-lg animate-in fade-in slide-in-from-right-4">
                  <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">Match {currentResultIndex + 1} / {searchResults.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => navigateSearch('prev')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬆️</button>
                    <button onClick={() => navigateSearch('next')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬇️</button>
                  </div>
                </div>
              )}
            </div>

            <div className={`mb-6 p-5 rounded-2xl border flex items-center justify-between transition-all ${isDateClosed() ? 'bg-red-50 border-red-100' : 'bg-[#3F9185]/5 border-[#3F9185]/10'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full animate-pulse ${isDateClosed() ? 'bg-red-500' : 'bg-[#3F9185]'}`}></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Clinic Status</p>
                  <p className="font-bold text-slate-800">{isDateClosed() ? 'Closed to Patients' : 'Open for Bookings'}</p>
                </div>
              </div>
              <button onClick={() => toggleDayStatus(selectedDate)} className={`px-6 py-2 rounded-xl font-black text-xs uppercase ${isDateClosed() ? 'bg-white text-red-500 border border-red-200 shadow-sm' : 'bg-[#3F9185] text-white hover:opacity-90'}`}>{isDateClosed() ? 'Mark as Open' : 'Mark as Closed'}</button>
            </div>

            <div className="mb-8 p-5 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-500"><Clock size={16} /><span className="text-xs font-bold uppercase">Shift for this specific day:</span></div>
              <div className="flex items-center gap-2">
                <input type="time" className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none" value={config.dailyOverrides?.[selectedDate]?.start || config.hours.start} onChange={(e) => updateDailyHours(e.target.value, config.dailyOverrides?.[selectedDate]?.end || config.hours.end)} />
                <span className="text-slate-300">to</span>
                <input type="time" className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none" value={config.dailyOverrides?.[selectedDate]?.end || config.hours.end} onChange={(e) => updateDailyHours(config.dailyOverrides?.[selectedDate]?.start || config.hours.start, e.target.value)} />
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-2 scroll-smooth">
              {renderGrid()}
            </div>
          </div>
        )}

        {/* --- CRM & PATIENT HUB VIEW --- */}
        {view === 'messages' && (
          <div className="glass-card rounded-[2.5rem] overflow-hidden shadow-2xl flex h-[calc(100vh-10rem)] min-h-[600px] border border-slate-100">
            {/* LEFT SIDEBAR: Search and Patient List */}
            <div className="w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col">
              
              <div className="p-4 bg-white border-b border-slate-200 space-y-3">
                <div className="flex gap-2">
                  <button 
                     onClick={() => setIsNewMessageModalOpen(true)}
                     className="flex-1 bg-[#3F9185] hover:bg-teal-700 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm text-xs"
                  >
                     <User size={16} /> New Chat
                  </button>
                  <button 
                     onClick={() => setIsCsvModalOpen(true)}
                     className="bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center transition-all shadow-sm"
                     title="Import CSV Database"
                  >
                     <Upload size={16} />
                  </button>
                </div>
                
                <button 
                   onClick={() => setIsManualMessageModalOpen(true)}
                   className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm text-xs"
                >
                   <Send size={16} /> Send Manual Message
                </button>

                <div className="relative pt-2">
                  <Search size={14} className="absolute left-3 top-[1.35rem] text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search master CRM records..." 
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-xs font-bold text-slate-600"
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setGlobalMessageSearch(''); }}
                  />
                </div>

                <div className="relative pt-1">
                  <Search size={14} className="absolute left-3 top-[0.85rem] text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search inside messages..." 
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-xs font-bold text-slate-600"
                    value={globalMessageSearch}
                    onChange={e => { setGlobalMessageSearch(e.target.value); setPatientSearch(''); }}
                  />
                </div>
              </div>

              {/* Patient / Message List Rendering */}
              <div className="flex-1 overflow-y-auto">
                {globalMessageSearch.trim() ? (
                  /* Display Global Message Search Results */
                  chatMessages
                    .filter(m => (m.text || '').toLowerCase().includes(globalMessageSearch.toLowerCase()))
                    .map(msg => (
                      <button 
                        key={msg.id}
                        onClick={() => {
                          const patient = finalSidebarList.find(p => (p.phone && p.phone === msg.phone) || (p.email && p.email === msg.email));
                          if (patient) {
                            setSelectedChatPatient(patient);
                            setGlobalMessageSearch(''); 
                          }
                        }}
                        className="w-full text-left p-4 border-b border-slate-100 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-black text-[#3F9185] truncate">{msg.patientName || msg.phone || msg.email}</p>
                          {msg.type === 'email' && <Mail size={12} className="text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{msg.text}</p>
                        <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                          {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleString('en-GB') : ''}
                        </p>
                      </button>
                    ))
                ) : (
                  /* Display Active WhatsApp-Style List */
                  finalSidebarList
                    .filter(p => 
                      (p.patientName || '').toLowerCase().includes(patientSearch.toLowerCase()) ||
                      (p.email || '').toLowerCase().includes(patientSearch.toLowerCase()) ||
                      (p.phone || '').toLowerCase().includes(patientSearch.toLowerCase())
                    )
                    .map((patient: any) => {
                      const pStats = patientStats.get(patient.id) || patientStats.get(patient.phone) || patientStats.get(patient.email) || { unread: 0, lastTime: 0 };
                      const isUnread = pStats.unread > 0;
                      const isMasterRecord = patient.id && !patient.id.startsWith('unknown-');

                      const recentMsg = chatMessages.slice().reverse().find(m => (m.phone === patient.phone || m.email === patient.email));

                      return (
                        <button 
                          key={patient.id || patient.phone || patient.email} 
                          onClick={() => setSelectedChatPatient(patient)}
                          className={`w-full text-left p-4 border-b border-slate-100 hover:bg-white transition-colors flex items-center gap-3 ${selectedChatPatient?.id === patient.id ? 'bg-white border-l-4 border-l-[#3F9185]' : ''} ${isUnread ? 'bg-teal-50/30' : ''}`}
                        >
                          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold shrink-0 relative">
                            <User size={20} />
                            {isUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                          </div>
                          <div className="overflow-hidden flex-1">
                            <p className={`text-sm truncate flex items-center gap-2 ${isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>
                               {patient.patientName}
                               {isMasterRecord && !patient.imported && <span className="w-2 h-2 bg-indigo-400 rounded-full" title="Master Record"></span>}
                               {patient.imported && <span className="w-2 h-2 bg-purple-400 rounded-full" title="Imported CSV Record"></span>}
                            </p>
                            <p className={`text-[10px] truncate ${isUnread ? 'font-bold text-[#3F9185]' : 'text-slate-500'}`}>{recentMsg ? recentMsg.text : patient.phone || 'No contact info'}</p>
                          </div>
                          {isUnread && (
                            <div className="bg-[#3F9185] text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-sm animate-in zoom-in">
                              {pStats.unread}
                            </div>
                          )}
                        </button>
                      );
                    })
                )}

                {!globalMessageSearch.trim() && finalSidebarList.length === 0 && (
                  <p className="p-6 text-center text-slate-400 font-bold text-sm">No active patients. Import CSV or start a chat.</p>
                )}
              </div>
            </div>

            {/* RIGHT PANE - Master CRM Workspace */}
            <div className="flex-1 bg-white flex flex-col overflow-hidden">
              {selectedChatPatient ? (
                <>
                  {/* MASTER CRM HEADER */}
                  <div className="bg-white border-b border-slate-200 z-10 shadow-sm">
                    <div className="p-6 pb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 shadow-inner">
                          <User size={24} />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedChatPatient.patientName}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center gap-1.5"><MessageSquare size={12}/> {selectedChatPatient.phone || 'No phone'}</span>
                            <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center gap-1.5"><Mail size={12}/> {selectedChatPatient.email || 'No email'}</span>
                            {selectedChatPatient.id && !selectedChatPatient.id.startsWith('unknown-') && (
                               <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md uppercase tracking-wider">CRM Master</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* CRM Tabs */}
                    <div className="flex gap-6 px-6">
                       <button onClick={() => setCrmTab('chat')} className={`pb-3 text-sm font-black border-b-2 transition-all ${crmTab === 'chat' ? 'border-[#3F9185] text-[#3F9185]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Communications</button>
                       <button onClick={() => setCrmTab('ledger')} className={`pb-3 text-sm font-black border-b-2 transition-all flex items-center gap-1.5 ${crmTab === 'ledger' ? 'border-[#3F9185] text-[#3F9185]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><History size={14}/> Appointment Ledger</button>
                       <button onClick={() => setCrmTab('profile')} className={`pb-3 text-sm font-black border-b-2 transition-all flex items-center gap-1.5 ${crmTab === 'profile' ? 'border-[#3F9185] text-[#3F9185]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><UserCog size={14}/> Master Profile</button>
                    </div>
                  </div>

                  {/* TAB 1: COMMUNICATIONS */}
                  {crmTab === 'chat' && (
                    <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden">
                      <div className="p-3 bg-white border-b border-slate-100 flex justify-center gap-2 shadow-sm z-10">
                        <button onClick={() => setCommsType('SMS')} className={`px-6 py-2 rounded-md text-xs font-black transition-all ${commsType === 'SMS' ? 'bg-slate-800 shadow text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>SMS / Timeline</button>
                        <button onClick={() => setCommsType('Email')} className={`px-6 py-2 rounded-md text-xs font-black transition-all ${commsType === 'Email' ? 'bg-[#3F9185] shadow text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Compose Email</button>
                      </div>

                      {commsType === 'SMS' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          <div className="flex-1 p-6 overflow-y-auto space-y-4">
                            <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-200/50 py-1 px-3 rounded-full w-max mx-auto mb-6">Patient Timeline</p>
                            
                            {chatMessages
                              .filter(m => (m.phone && m.phone === selectedChatPatient.phone) || (m.email && m.email === selectedChatPatient.email))
                              .map(msg => (
                              <Fragment key={msg.id}>
                                {sessionUnreadMessageId === msg.id && (
                                  <div id={`unread-divider-${msg.id}`} className="flex items-center gap-4 my-6">
                                    <div className="h-px bg-teal-500/30 flex-1"></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100 shadow-sm">Unread Messages</span>
                                    <div className="h-px bg-teal-500/30 flex-1"></div>
                                  </div>
                                )}
                                <div className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm ${msg.direction === 'outbound' ? 'bg-[#3F9185] text-white rounded-tr-sm' : 'bg-white text-slate-800 rounded-tl-sm border border-slate-100'}`}>
                                    
                                    {msg.type === 'email' && (
                                      <div className="flex items-center justify-between gap-4 mb-3 pb-3 border-b border-teal-500/30">
                                        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                                          <Mail size={14} /> Email {msg.direction === 'outbound' ? 'Sent' : 'Received'}
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          {msg.attachmentName && (
                                            <button 
                                              onClick={() => {
                                                if (!msg.attachmentBase64) return alert('File content not available for older messages.');
                                                const link = document.createElement('a');
                                                link.href = `data:${msg.attachmentType || 'application/octet-stream'};base64,${msg.attachmentBase64}`;
                                                link.download = msg.attachmentName;
                                                link.click();
                                              }}
                                              className="flex items-center gap-1.5 bg-black/10 hover:bg-[#3F9185] hover:text-white px-3 py-1.5 rounded-md text-[10px] font-bold transition-all shadow-sm max-w-[200px]" 
                                              title="Click to download"
                                            >
                                              <Paperclip size={12} className="shrink-0" />
                                              <span className="truncate">{msg.attachmentName}</span>
                                              <Download size={10} className="shrink-0 ml-1 opacity-70" />
                                            </button>
                                          )}
                                          
                                          {/* DEDICATED REPLY BUTTON */}
                                          {msg.direction === 'inbound' && msg.messageId && (
                                            <button 
                                              onClick={() => {
                                                setCommsType('Email');
                                                setReplyingToMessage(msg);
                                                let extractedSubject = "Threaded Reply";
                                                if (msg.text.startsWith("Subject: ")) {
                                                  extractedSubject = msg.text.split('\n')[0].replace("Subject: ", "").trim();
                                                }
                                                const finalSubject = extractedSubject.toLowerCase().startsWith("re:") ? extractedSubject : `Re: ${extractedSubject}`;
                                                setEmailData({...emailData, subject: finalSubject});
                                              }}
                                              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-800 text-white px-3 py-1.5 rounded-md text-[10px] font-bold transition-all shadow-sm" 
                                              title="Reply directly to this email thread"
                                            >
                                              <Reply size={12} className="shrink-0" />
                                              Reply
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                    <p className={`text-[9px] mt-2 text-right ${msg.direction === 'outbound' ? 'text-teal-100' : 'text-slate-400'}`}>
                                      {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'Sending...'}
                                    </p>
                                  </div>
                                </div>
                              </Fragment>
                            ))}
                            <div ref={messagesEndRef} className="h-1 shrink-0" />
                          </div>
                          
                          <div className="p-4 bg-white border-t border-slate-200 flex gap-2 shrink-0">
                            <input 
                              type="text" 
                              placeholder="Type an SMS message to patient..." 
                              className="flex-1 p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185] text-sm font-medium border border-slate-100"
                              value={outboundSMS}
                              onChange={e => setOutboundSMS(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleSendSMS()}
                            />
                            <button onClick={handleSendSMS} disabled={isSendingComms || !outboundSMS} className="p-4 bg-[#3F9185] text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center shadow-md">
                              <Send size={20} />
                            </button>
                          </div>
                        </div>
                      )}

                      {commsType === 'Email' && (
                        <div className="flex-1 p-8 overflow-y-auto bg-white">
                          {!selectedChatPatient.email ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                               <Mail size={48} className="opacity-20" />
                               <p className="font-bold">No email address on file for this patient.</p>
                            </div>
                          ) : (
                            <div className="space-y-4 max-w-2xl mx-auto">
                              
                              {/* THREADING INDICATOR BANNER */}
                              {replyingToMessage && (
                                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl animate-in zoom-in-95 shadow-sm">
                                  <div className="flex items-center gap-3 text-indigo-700">
                                    <div className="bg-white p-1.5 rounded-md shadow-sm"><Reply size={16} /></div>
                                    <div>
                                      <p className="text-xs font-black uppercase tracking-wider">Thread Locked</p>
                                      <p className="text-xs font-medium mt-0.5">This reply will securely group with the patient's original email.</p>
                                    </div>
                                  </div>
                                  <button onClick={() => setReplyingToMessage(null)} className="text-indigo-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-md shadow-sm" title="Cancel Thread Lock">
                                    <X size={16} />
                                  </button>
                                </div>
                              )}

                              <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Subject / Header</label>
                                <input 
                                  type="text" placeholder="e.g. Your requested documentation" 
                                  className={`w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border focus:border-[#3F9185] text-sm font-bold ${replyingToMessage ? 'border-indigo-200 bg-white' : 'border-slate-200'}`}
                                  value={emailData.subject} onChange={e => setEmailData({...emailData, subject: e.target.value})}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Message Body</label>
                                <textarea 
                                  placeholder="Dear patient..." 
                                  className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-slate-200 focus:border-[#3F9185] h-64 text-sm resize-none"
                                  value={emailData.body} onChange={e => setEmailData({...emailData, body: e.target.value})}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-2">Attachments (Optional)</label>
                                
                                {!emailData.attachment ? (
                                  <label className={`flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all w-full ${isCompressing ? 'border-[#3F9185] bg-teal-50 cursor-wait' : 'border-slate-200 hover:border-[#3F9185] hover:bg-teal-50/50 bg-slate-50 cursor-pointer'}`}>
                                     {isCompressing ? (
                                       <div className="w-5 h-5 border-2 border-[#3F9185] border-t-transparent rounded-full animate-spin"></div>
                                     ) : (
                                       <Paperclip size={20} className="text-slate-400" />
                                     )}
                                     <div className="flex flex-col">
                                       <span className={`text-sm font-bold ${isCompressing ? 'text-[#3F9185]' : 'text-slate-600'}`}>
                                         {isCompressing ? 'Compressing file...' : 'Click to upload an attachment'}
                                       </span>
                                       <span className="text-[10px] text-slate-400 font-medium">Auto-compresses large image scans and PDFs</span>
                                     </div>
                                     <input 
                                       type="file" 
                                       className="hidden" 
                                       disabled={isCompressing}
                                       accept="image/*,application/pdf"
                                       onChange={async (e) => {
                                         const file = e.target.files?.[0];
                                         if (!file) return;

                                         setIsCompressing(true);

                                         if (file.type === 'application/pdf') {
                                           try {
                                             pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                                             const fileReader = new FileReader();
                                             fileReader.onload = async function() {
                                               try {
                                                 const typedarray = new Uint8Array(this.result as ArrayBuffer);
                                                 const pdf = await pdfjsLib.getDocument(typedarray).promise;
                                                 
                                                 const newPdf = new jsPDF('p', 'pt', 'a4'); 

                                                 for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                                                   const page = await pdf.getPage(pageNum);
                                                   const viewport = page.getViewport({ scale: 1.2 }); 
                                                   
                                                   const canvas = document.createElement('canvas');
                                                   const ctx = canvas.getContext('2d');
                                                   if (!ctx) continue;
                                                   
                                                   canvas.height = viewport.height;
                                                   canvas.width = viewport.width;

                                                   // @ts-ignore
                                                   await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                                                   const imgData = canvas.toDataURL('image/jpeg', 0.5); 

                                                   if (pageNum > 1) newPdf.addPage();

                                                   const pdfWidth = newPdf.internal.pageSize.getWidth();
                                                   const pdfHeight = (viewport.height * pdfWidth) / viewport.width;

                                                   newPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                                                 }

                                                 const pdfBlob = newPdf.output('blob');
                                                 const compressedFile = new File([pdfBlob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.pdf", {
                                                   type: 'application/pdf',
                                                   lastModified: Date.now(),
                                                 });

                                                 if (compressedFile.size > 700 * 1024) {
                                                    alert("Even after heavy compression, this multi-page PDF is too large. Please use a document with fewer pages.");
                                                 } else {
                                                   setEmailData({...emailData, attachment: compressedFile});
                                                 }
                                                 setIsCompressing(false);

                                               } catch (err) {
                                                  console.error(err);
                                                  alert("Could not process the PDF. It may be encrypted or corrupted.");
                                                  setIsCompressing(false);
                                               }
                                             };
                                             fileReader.readAsArrayBuffer(file);
                                           } catch (err) {
                                              alert("Failed to initialise PDF compressor.");
                                              setIsCompressing(false);
                                           }
                                           return;
                                         }

                                         try {
                                            const reader = new FileReader();
                                            reader.readAsDataURL(file);
                                            reader.onload = (event) => {
                                              const img = new Image();
                                              img.src = event.target?.result as string;
                                              img.onload = () => {
                                                const canvas = document.createElement('canvas');
                                                let width = img.width;
                                                let height = img.height;

                                                const MAX_DIMENSION = 1000;
                                                if (width > height && width > MAX_DIMENSION) {
                                                  height *= MAX_DIMENSION / width;
                                                  width = MAX_DIMENSION;
                                                } else if (height > MAX_DIMENSION) {
                                                  width *= MAX_DIMENSION / height;
                                                  height = MAX_DIMENSION;
                                                }

                                                canvas.width = width;
                                                canvas.height = height;
                                                const ctx = canvas.getContext('2d');
                                                ctx?.drawImage(img, 0, 0, width, height);

                                                canvas.toBlob((blob) => {
                                                  if (blob) {
                                                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", {
                                                      type: 'image/jpeg',
                                                      lastModified: Date.now(),
                                                    });

                                                    if (compressedFile.size > 700 * 1024) {
                                                      alert("Image is still too large even after compression. Please try a smaller scan.");
                                                    } else {
                                                      setEmailData({...emailData, attachment: compressedFile});
                                                    }
                                                  }
                                                  setIsCompressing(false);
                                                }, 'image/jpeg', 0.5); 
                                              };
                                            };
                                         } catch (err) {
                                            alert("Failed to compress image.");
                                            setIsCompressing(false);
                                         }
                                       }} 
                                     />
                                  </label>
                                ) : (
                                  <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-200 rounded-xl w-full animate-in fade-in zoom-in-95 shadow-sm">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                                        <CheckCircle2 size={20} className="text-[#3F9185]" />
                                      </div>
                                      <div className="flex flex-col truncate">
                                        <span className="text-sm font-bold text-slate-700 truncate">{emailData.attachment.name}</span>
                                        <span className="text-[10px] font-black text-[#3F9185] uppercase tracking-wider">
                                          Ready to send ({(emailData.attachment.size / 1024).toFixed(1)} KB)
                                        </span>
                                      </div>
                                    </div>
                                    <button onClick={() => setEmailData({...emailData, attachment: null})} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors shrink-0" title="Remove attachment">
                                      <X size={18} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <button onClick={handleSendEmail} disabled={isSendingComms || !emailData.body} className="w-full py-4 mt-4 bg-[#3F9185] text-white rounded-xl font-black shadow-lg shadow-teal-900/10 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                                 {isSendingComms ? 'Sending...' : 'Send Secure Email'} <Send size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: APPOINTMENT LEDGER */}
                  {crmTab === 'ledger' && (
                    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto">
                      <div className="max-w-4xl mx-auto space-y-4">
                        <div className="flex items-center justify-between mb-4">
                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><History size={16}/> Lifetime History</h4>
                           <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">{activePatientLedger.length} Records Found</span>
                        </div>
                        
                        {activePatientLedger.length === 0 ? (
                           <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-400 font-bold">No appointment history found for this patient.</div>
                        ) : (
                          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Date & Time</th>
                                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Service Type</th>
                                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Booking Source</th>
                                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {activePatientLedger.map((app) => (
                                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4">
                                      <p className="font-bold text-slate-800 text-sm">{new Date(app.appointmentDate).toLocaleDateString('en-GB')}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">@ {app.appointmentTime}</p>
                                    </td>
                                    <td className="p-4 text-sm font-bold text-slate-600">{app.appointmentType || 'Eye Check'}</td>
                                    <td className="p-4">
                                       <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${app.source === 'Admin' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                         {app.source || 'Online'}
                                       </span>
                                    </td>
                                    <td className="p-4 text-right">
                                       <span className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${getStatusColor(app.status || 'Booked')}`}>
                                         {app.status || 'Booked'}
                                       </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: MASTER PROFILE EDITOR */}
                  {crmTab === 'profile' && (
                    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto">
                      <div className="max-w-2xl mx-auto space-y-6">
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
                           <UserCog size={24} className="text-indigo-500 shrink-0 mt-0.5" />
                           <div>
                              <p className="text-sm font-black text-indigo-900">Master Record Control</p>
                              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">Updating details here will permanently standardise this patient's information across all of their historical and future appointment records within the database.</p>
                           </div>
                        </div>

                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                           <div className="space-y-4">
                             <div>
                               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Full Legal Name</label>
                               <input 
                                 type="text" 
                                 value={editProfileData.patientName} 
                                 onChange={e => setEditProfileData({...editProfileData, patientName: e.target.value})}
                                 className="w-full p-4 mt-1 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-800"
                               />
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Mobile / Phone</label>
                                 <input 
                                   type="text" 
                                   value={editProfileData.phone} 
                                   onChange={e => setEditProfileData({...editProfileData, phone: e.target.value})}
                                   className="w-full p-4 mt-1 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-800"
                                 />
                               </div>
                               <div>
                                 <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
                                 <input 
                                   type="date" 
                                   value={editProfileData.dob} 
                                   onChange={e => setEditProfileData({...editProfileData, dob: e.target.value})}
                                   className="w-full p-4 mt-1 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-800"
                                 />
                               </div>
                             </div>

                             <div>
                               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email Address</label>
                               <input 
                                 type="email" 
                                 value={editProfileData.email} 
                                 onChange={e => setEditProfileData({...editProfileData, email: e.target.value.toLowerCase()})}
                                 className="w-full p-4 mt-1 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-800"
                               />
                             </div>
                           </div>
                           
                           <div className="pt-4 border-t border-slate-100">
                             <button 
                               onClick={handleUpdateMasterProfile} 
                               disabled={!editProfileData.patientName}
                               className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-black shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                             >
                               <CheckCircle2 size={18} /> Update Master Record
                             </button>
                           </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <User size={64} className="opacity-20 mb-4" />
                  <p className="font-bold text-lg text-slate-400">Select a patient to open their CRM profile</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- LOGS VIEW --- */}
        {view === 'logs' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <FileText className="text-[#3F9185]" /> Communication Logs
              </h2>
            </div>
            <div className="flex gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex-1">
                <input type="text" placeholder="Search by Patient, Phone, or Email..." className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-medium" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
              </div>
              <select className="p-3 rounded-xl border border-slate-200 outline-none text-sm font-bold text-slate-600 bg-white" value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)}>
                <option value="All">All Types</option><option value="SMS">SMS</option><option value="Email">Email</option>
              </select>
              <select className="p-3 rounded-xl border border-slate-200 outline-none text-sm font-bold text-slate-600 bg-white" value={logStatusFilter} onChange={(e) => setLogStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option><option value="Sent">Sent</option><option value="Failed">Failed</option>
              </select>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Time Sent</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Patient</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Type</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Contact / Destination</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Action Triggered</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {logs.filter(log => logTypeFilter === "All" || log.type === logTypeFilter).filter(log => logStatusFilter === "All" || log.status === logStatusFilter).filter(log => (log.patientName || '').toLowerCase().includes(logSearch.toLowerCase()) || (log.contactInfo || '').toLowerCase().includes(logSearch.toLowerCase())).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-xs font-bold text-slate-500 tabular-nums">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}</td>
                        <td className="p-4"><p className="font-bold text-slate-800 text-sm">{log.patientName}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Appt: {new Date(log.apptDate).toLocaleDateString('en-GB')} @ {log.apptTime}</p></td>
                        <td className="p-4"><span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${log.type === 'SMS' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{log.type}</span></td>
                        <td className="p-4 font-medium text-sm text-slate-600">{log.contactInfo}</td>
                        <td className="p-4 font-medium text-sm text-slate-500">{log.action}</td>
                        <td className="p-4 text-right">
                          {log.status === 'Sent' ? <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100"><CheckCircle2 size={14} /> <span className="text-xs font-bold">Sent</span></div> : <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100" title={log.errorMsg}><XCircle size={14} /> <span className="text-xs font-bold">Failed</span></div>}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold italic">No communication logs found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS VIEW --- */}
        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8">
            <h2 className="text-2xl font-black text-slate-800">Clinic Settings</h2>
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Durations (mins)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Eye Examination</label>
                    <input type="number" value={config.times.eyeCheck} onChange={e => setConfig({...config, times: {...config.times, eyeCheck: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Contact Lens Check</label>
                    <input type="number" value={config.times.contactLens} onChange={e => setConfig({...config, times: {...config.times, contactLens: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Activity size={18}/> Clinic Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Opens</label>
                    <input type="time" value={config.hours.start} onChange={e => setConfig({...config, hours: {...config.hours, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Closes</label>
                    <input type="time" value={config.hours.end} onChange={e => setConfig({...config, hours: {...config.hours, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Lunch Break</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.lunch.enabled} onChange={e => setConfig({...config, lunch: {...config.lunch, enabled: e.target.checked}})} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3F9185]"></div>
                  </label>
                </div>
                <div className={`grid grid-cols-2 gap-4 ${!config.lunch.enabled ? 'opacity-30 pointer-events-none' : ''}`}>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Starts</label>
                    <input type="time" value={config.lunch.start} onChange={e => setConfig({...config, lunch: {...config.lunch, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Ends</label>
                    <input type="time" value={config.lunch.end} onChange={e => setConfig({...config, lunch: {...config.lunch, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><CalendarIcon size={18}/> Weekly Off</h3>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day, idx) => (
                    <button key={day} onClick={() => toggleWeeklyDay(idx)} className={`px-4 py-2 rounded-xl font-bold text-xs ${config.weeklyOff.includes(idx) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={saveConfig} className="px-10 py-4 bg-[#3F9185] text-white font-black rounded-2xl shadow-lg hover:opacity-90 transition-all">Save Changes</button>
          </div>
        )}

        {/* --- REPORTS VIEW --- */}
        {view === 'reports' && <ReportsDashboard appointments={appointments} />}
      </div>

      {/* --- CSV IMPORT MODAL WITH BATCHING --- */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[130] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black text-slate-800">Import Master CRM Records</h2>
               <button onClick={() => { setIsCsvModalOpen(false); setCsvFile(null); setCsvHeaders([]); setCsvData([]); setImportAnalysis(null); }} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            
            {!csvHeaders.length ? (
              <div className="space-y-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-indigo-200 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                    <p className="text-sm font-bold text-slate-600">Click to upload CSV file</p>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                </label>
                <p className="text-xs text-slate-500 text-center font-medium">Your CSV must have headers. Missing details in rows are automatically handled safely.</p>
              </div>
            ) : importAnalysis ? (
              <div className="space-y-6">
                <div className="bg-teal-50 p-5 rounded-xl border border-teal-100">
                   <h3 className="font-black text-teal-900 mb-4">Data Analysis Complete</h3>
                   <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-teal-800 flex items-center gap-2"><User size={16}/> New Patients to Add</span>
                      <span className="bg-white text-teal-700 font-black px-3 py-1 rounded-lg shadow-sm border border-teal-100">{importAnalysis.new.length}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-teal-800 flex items-center gap-2"><Settings size={16}/> Duplicates to Merge</span>
                      <span className="bg-white text-teal-700 font-black px-3 py-1 rounded-lg shadow-sm border border-teal-100">{importAnalysis.duplicates.length}</span>
                   </div>
                   <p className="text-[10px] text-teal-600 font-medium mt-4 leading-relaxed">Duplicates were matched using exact Phone Number or Email combinations. The system will safely merge new fields into existing records without erasing current data.</p>
                </div>

                <button 
                  onClick={processBatchedImport} 
                  disabled={isImporting} 
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg disabled:opacity-50 transition-all flex flex-col items-center justify-center gap-1"
                >
                  <span>{isImporting ? 'Running Batch Importer...' : 'Confirm & Execute Import'}</span>
                  {importProgress && <span className="text-[10px] text-indigo-200 font-medium tracking-wide uppercase">{importProgress}</span>}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-teal-50 p-3 rounded-xl border border-teal-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-900 flex items-center gap-2"><FileText size={14}/> {csvFile ? csvFile.name : 'CSV Loaded'}</span>
                  <span className="text-[10px] font-black text-teal-700 bg-teal-100/50 px-2 py-1 rounded-md">{csvData.length} rows</span>
                </div>
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6">
                   <p className="text-sm font-bold text-indigo-900 mb-1">Map your columns</p>
                   <p className="text-xs text-indigo-700">Select which CSV header matches the CRM fields below.</p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-black uppercase text-slate-500 w-1/3">Full Name</label>
                    <select className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none" value={csvMapping.name} onChange={e => setCsvMapping({...csvMapping, name: e.target.value})}>
                      <option value="">-- Select Header --</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-black uppercase text-slate-500 w-1/3">Phone No.</label>
                    <select className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none" value={csvMapping.phone} onChange={e => setCsvMapping({...csvMapping, phone: e.target.value})}>
                      <option value="">-- Select Header --</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-black uppercase text-slate-500 w-1/3">Email</label>
                    <select className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none" value={csvMapping.email} onChange={e => setCsvMapping({...csvMapping, email: e.target.value})}>
                      <option value="">-- Select Header --</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-black uppercase text-slate-500 w-1/3">DOB</label>
                    <select className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none" value={csvMapping.dob} onChange={e => setCsvMapping({...csvMapping, dob: e.target.value})}>
                      <option value="">-- Select Header --</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={analyzeCsvData} 
                  disabled={isAnalyzing || (!csvMapping.name && !csvMapping.email && !csvMapping.phone)} 
                  className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? 'Scanning for Duplicates...' : 'Analyze Data & Find Duplicates'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MANUAL MESSAGE SEND MODAL --- */}
      {isManualMessageModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[130] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black text-slate-800">Send Manual Message</h2>
               <button onClick={() => setIsManualMessageModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            
            <div className="flex gap-2 mb-6 p-1.5 bg-slate-100 rounded-xl">
              <button 
                onClick={() => setManualMsgType('SMS')} 
                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${manualMsgType === 'SMS' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Send SMS
              </button>
              <button 
                onClick={() => setManualMsgType('Email')} 
                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${manualMsgType === 'Email' ? 'bg-[#3F9185] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Send Email
              </button>
            </div>

            <div className="space-y-4 mb-8">
              {manualMsgType === 'SMS' ? (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">UK Mobile Number</label>
                    <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 focus-within:border-[#3F9185] overflow-hidden mt-1 transition-colors">
                      <div className="px-4 py-4 bg-slate-100 border-r border-slate-200 font-black text-slate-600 select-none">
                        +44
                      </div>
                      <input 
                        type="tel" 
                        placeholder="7123456789 (Drop the leading 0)" 
                        className="w-full p-4 bg-transparent outline-none text-sm font-bold text-slate-800"
                        value={manualMsgData.phone}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.startsWith('0')) val = val.substring(1); 
                          if (val.length <= 11) setManualMsgData({...manualMsgData, phone: val});
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1 block">Message Content</label>
                    <div className="relative w-full rounded-xl bg-slate-50 border border-slate-200 focus-within:border-[#3F9185] overflow-hidden flex flex-col transition-colors">
                      <textarea 
                        className="w-full p-4 pb-0 bg-transparent outline-none resize-none h-32 text-sm font-medium"
                        value={manualMsgData.body}
                        onChange={(e) => setManualMsgData({...manualMsgData, body: e.target.value})}
                        placeholder="Type your message to the patient here..."
                      />
                      <div className="px-4 pb-4 pt-2 bg-transparent text-slate-400 text-sm font-medium whitespace-pre-wrap select-none border-t border-slate-100/50 mt-2">
                        {"\n\nThe Eye Centre, Leicester"}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Recipient Name</label>
                      <input 
                        type="text" placeholder="e.g. John Doe" 
                        className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-slate-200 focus:border-[#3F9185] text-sm font-bold"
                        value={manualMsgData.name} onChange={e => setManualMsgData({...manualMsgData, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email Address</label>
                      <input 
                        type="email" placeholder="john@example.com" 
                        className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-slate-200 focus:border-[#3F9185] text-sm font-bold"
                        value={manualMsgData.email} onChange={e => setManualMsgData({...manualMsgData, email: e.target.value.toLowerCase()})}
                      />
                      {manualMsgData.email.length > 0 && !isEmailValid && (
                        <p className="text-[10px] text-red-500 font-bold mt-1 ml-1">Invalid email format</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Subject</label>
                    <input 
                      type="text" placeholder="e.g. Important Information" 
                      className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-slate-200 focus:border-[#3F9185] text-sm font-bold"
                      value={manualMsgData.subject} onChange={e => setManualMsgData({...manualMsgData, subject: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Message Body</label>
                    <textarea 
                      placeholder="Dear patient..." 
                      className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-slate-200 focus:border-[#3F9185] h-32 text-sm resize-none"
                      value={manualMsgData.body} onChange={e => setManualMsgData({...manualMsgData, body: e.target.value})}
                    />
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={handleSendManualMessage} 
              disabled={isSendingManual || !isManualValid} 
              className={`w-full py-4 text-white rounded-xl font-black shadow-lg flex items-center justify-center gap-2 transition-all ${!isManualValid ? 'bg-slate-300 cursor-not-allowed shadow-none' : manualMsgType === 'SMS' ? 'bg-slate-800 hover:bg-slate-900' : 'bg-[#3F9185] hover:opacity-90'}`}
            >
               {isSendingManual ? 'Sending...' : `Send Manual ${manualMsgType}`} <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* --- NEW MESSAGE MODAL (ADDRESS BOOK) --- */}
      {isNewMessageModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black text-slate-800">New Patient Chat</h2>
               <button onClick={() => setIsNewMessageModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            <div className="relative mb-4">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Search all contacts..." 
                 className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-700"
                 value={newMessageSearch}
                 onChange={e => setNewMessageSearch(e.target.value)}
               />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-2">
               {finalSidebarList
                  .filter(c => 
                     (c.patientName || '').toLowerCase().includes(newMessageSearch.toLowerCase()) ||
                     (c.email || '').toLowerCase().includes(newMessageSearch.toLowerCase()) ||
                     (c.phone || '').toLowerCase().includes(newMessageSearch.toLowerCase())
                  )
                  .map(contact => (
                     <button 
                       key={contact.id || contact.phone || contact.email}
                       onClick={() => {
                          setSelectedChatPatient(contact);
                          setIsNewMessageModalOpen(false);
                          setNewMessageSearch('');
                       }}
                       className="w-full text-left p-3 hover:bg-slate-50 rounded-xl transition-colors flex flex-col border border-transparent hover:border-slate-100"
                     >
                       <span className="font-bold text-slate-800">{contact.patientName}</span>
                       <span className="text-xs text-slate-500">{contact.phone || contact.email}</span>
                     </button>
                  ))
               }
               {finalSidebarList.length === 0 && (
                 <p className="text-center text-slate-400 font-bold text-sm mt-4">No patients found in your diary.</p>
               )}
            </div>
          </div>
        </div>
      )}

      {/* --- RETROSPECTIVE LINK APPOINTMENT MODAL --- */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[140] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800">Link to CRM Patient</h2>
                <button onClick={() => { setIsLinkModalOpen(false); setApptToLink(null); }} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
             </div>
             <p className="text-sm text-slate-500 mb-4">Link this online booking to an existing master CRM record.</p>
             <input
                type="text" placeholder="Search CRM patients..."
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-bold text-slate-700 mb-4"
                value={linkSearchQuery} 
                onChange={e => {
                  setLinkSearchQuery(e.target.value);
                  performCloudSearch(e.target.value);
                }}
             />
             <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                {cloudSearchResults.map(p => (
                   <button
                     key={p.id}
                     onClick={async () => {
                        try {
                          await setDoc(doc(db, "appointments", apptToLink.id), { patientId: p.id }, { merge: true });
                          alert("Appointment securely linked to Master Record!");
                          setIsLinkModalOpen(false);
                          setApptToLink(null);
                          setLinkSearchQuery('');
                        } catch (e) { alert("Error linking appointment."); }
                     }}
                     className="w-full text-left p-3 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 rounded-xl transition-all"
                   >
                      <div className="font-bold text-slate-800">{p.patientName}</div>
                      <div className="text-xs text-slate-500">{p.phone || 'No phone'} • {p.email || 'No email'}</div>
                   </button>
                ))}
                {linkSearchQuery.length < 3 && <p className="text-xs font-bold text-slate-400 text-center py-4">Type at least 3 characters to search the cloud database...</p>}
                {linkSearchQuery.length >= 3 && cloudSearchResults.length === 0 && <p className="text-xs font-bold text-slate-400 text-center py-4">No master CRM records found.</p>}
             </div>
          </div>
        </div>
      )}

      {editingApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full animate-in zoom-in-95 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">Edit Patient Details</h3>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.patientName} onChange={e => setEditingApp({...editingApp, patientName: e.target.value})} placeholder="Name" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.email} onChange={e => setEditingApp({...editingApp, email: e.target.value})} placeholder="Email" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.phone} onChange={e => setEditingApp({...editingApp, phone: e.target.value})} placeholder="Phone" />
              <textarea className="w-full p-4 bg-slate-50 rounded-xl outline-none resize-none h-24 text-sm" value={editingApp.notes || ''} onChange={e => setEditingApp({...editingApp, notes: e.target.value})} placeholder="Admin Notes (Internal only)" />
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditingApp(null)} className="flex-1 p-4 font-bold text-slate-400">Cancel</button>
              <button onClick={updateAppointment} className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-slate-800 mb-6">Direct Admin Booking</h2>
            
            <div className="space-y-4">
              {/* --- CRM PATIENT SEARCH LINKING --- */}
              <div className="col-span-full mb-2 p-4 bg-indigo-50 rounded-xl border border-indigo-100 transition-all">
                 <label className="text-[10px] font-black uppercase text-indigo-400 ml-1">Search Master CRM Patient</label>
                 <input
  type="text"
  placeholder="Search by name, email or phone..."
  className="w-full p-3 mt-1 rounded-xl bg-white border border-indigo-200 outline-none focus:border-indigo-400 text-sm font-bold text-indigo-900"
  value={bookingSearchQuery}
  onChange={e => {
    setBookingSearchQuery(e.target.value);
    performCloudSearch(e.target.value);
  }}
/>
{bookingSearchQuery && (
  <div className="mt-2 max-h-32 overflow-y-auto bg-white rounded-lg border border-indigo-100 shadow-sm">
    {cloudSearchResults.map(p => (
                       <button
                         key={p.id}
                         onClick={() => {
                           setSelectedCrmPatientForBooking(p);
                           const names = (p.patientName || '').split(' ');
                           setNewBooking(prev => ({
                             ...prev,
                             firstName: names[0] || '',
                             lastName: names.slice(1).join(' ') || '',
                             email: p.email || '',
                             phone: p.phone || '',
                             dob: p.dob || ''
                           }));
                           setBookingSearchQuery('');
                         }}
                         className="w-full text-left p-2 text-sm hover:bg-indigo-50 font-medium"
                       >
                         {p.patientName} - <span className="text-slate-500 text-xs">{p.phone} {p.email}</span>
                       </button>
                     ))}
                   </div>
                 )}
                 {selectedCrmPatientForBooking && (
                   <>
                     <div className="mt-3 flex items-center justify-between bg-white p-3 rounded-lg border border-indigo-200 shadow-sm">
                        <span className="text-sm font-bold text-indigo-900 flex items-center gap-2"><LinkIcon size={14}/> Linked to: {selectedCrmPatientForBooking.patientName}</span>
                        <button onClick={() => { setSelectedCrmPatientForBooking(null); }} className="text-xs text-red-500 font-bold hover:underline">Unlink</button>
                     </div>
                     <label className="flex items-center gap-2 mt-3 cursor-pointer ml-1">
                        <input type="checkbox" checked={updateCrmOnBook} onChange={e => setUpdateCrmOnBook(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                        <span className="text-xs font-bold text-indigo-700">Update master details on booking</span>
                     </label>
                   </>
                 )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Appointment Date</label>
                <input 
                  type="date" 
                  min={new Date().toISOString().split('T')[0]} 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)} 
                  className="w-full p-4 bg-slate-50 rounded-xl font-bold text-[#3F9185] outline-none border-none focus:ring-2 focus:ring-[#3F9185]"
                />
                {isDateClosed() && (
                  <p className="text-red-500 text-[10px] font-bold mt-1 ml-1 uppercase">Clinic is closed on this date</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <input placeholder="First Name" className="p-4 bg-slate-50 rounded-xl outline-none" value={newBooking.firstName} onChange={e => setNewBooking({...newBooking, firstName: e.target.value})} />
                <input placeholder="Last Name" className="p-4 bg-slate-50 rounded-xl outline-none" value={newBooking.lastName} onChange={e => setNewBooking({...newBooking, lastName: e.target.value})} />
              </div>
              
              <div className="col-span-full space-y-2">
                <input 
                  type="email"
                  placeholder="Email Address (Optional - skip if struggling over phone)" 
                  className="w-full p-4 bg-slate-50 rounded-xl outline-none placeholder:text-slate-400" 
                  value={newBooking.email}
                  onChange={e => setNewBooking({...newBooking, email: e.target.value.toLowerCase()})} 
                />
              </div>
              
              <input placeholder="Phone (Optional if Email provided)" className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={newBooking.phone} onChange={e => setNewBooking({...newBooking, phone: e.target.value})} />
              
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={newBooking.dob} onChange={e => setNewBooking({...newBooking, dob: e.target.value})} />
              </div>
              
              <select className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold" value={newBooking.service} onChange={e => setNewBooking({...newBooking, service: e.target.value})}>
                <option value="Eye Check">Eye Check</option>
                <option value="Contact Lens Check">Contact Lens Check</option>
              </select>

              {newBooking.service === 'Eye Check' && newBooking.dob && (
                <div className="space-y-2 pt-2">
                  {calculateAge(newBooking.dob) >= 16 && calculateAge(newBooking.dob) <= 18 && (
                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.inFullTimeEducation} onChange={e => setNewBooking({...newBooking, inFullTimeEducation: e.target.checked})} />
                      <span className="text-[11px] font-bold text-slate-600">In full-time education?</span>
                    </label>
                  )}
                  {calculateAge(newBooking.dob) >= 19 && calculateAge(newBooking.dob) <= 59 && (
                    <>
                      <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                        <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.onBenefits} onChange={e => setNewBooking({...newBooking, onBenefits: e.target.checked})} />
                        <span className="text-[11px] font-bold text-slate-600">Receiving benefits?</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                        <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.isDiabetic} onChange={e => setNewBooking({...newBooking, isDiabetic: e.target.checked})} />
                        <span className="text-[11px] font-bold text-slate-600">Diabetic?</span>
                      </label>
                      {calculateAge(newBooking.dob) >= 40 && (
                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                          <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.familyGlaucoma} onChange={e => setNewBooking({...newBooking, familyGlaucoma: e.target.checked})} />
                          <span className="text-[11px] font-bold text-slate-600">Family history of Glaucoma?</span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Available Times</label>
                {isDateClosed() || calculateSlotsForDate(selectedDate).length === 0 ? (
                  <div className="w-full p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">No slots available</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {calculateSlotsForDate(selectedDate).map((t: string) => (
                      <button 
                        key={t}
                        onClick={() => setNewBooking({...newBooking, time: t})}
                        className={`py-2 rounded-lg text-[11px] font-black transition-all border-2 ${
                          newBooking.time === t 
                            ? 'bg-[#3F9185] text-white border-[#3F9185]' 
                            : 'bg-white text-slate-400 border-slate-100 hover:border-[#3F9185]/30'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setIsBookingModalOpen(false)} className="flex-1 p-4 font-bold text-slate-400">Cancel</button>
              <button onClick={handleAdminBooking} disabled={!newBooking.time || !newBooking.firstName || (!newBooking.email && !newBooking.phone) || isDateClosed()} className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}