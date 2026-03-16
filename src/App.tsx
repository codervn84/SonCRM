import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Users, 
  MessageSquare, 
  CheckSquare, 
  LayoutDashboard, 
  LogOut, 
  LogIn,
  MoreVertical,
  Phone,
  Mail,
  Building2,
  Calendar,
  Filter,
  ChevronRight,
  Clock,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  TrendingUp,
  DollarSign,
  Target,
  Briefcase
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocFromServer,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { format, isAfter, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db } from './firebase';
import { 
  Customer, 
  Interaction, 
  Task, 
  Opportunity,
  CustomerStatus, 
  InteractionType, 
  TaskStatus,
  OpportunityStage,
  OperationType,
  FirestoreErrorInfo
} from './types';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: CustomerStatus }) => {
  const colors = {
    Lead: 'bg-blue-100 text-blue-700 border-blue-200',
    Contact: 'bg-purple-100 text-purple-700 border-purple-200',
    Customer: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Inactive: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", colors[status])}>
      {status}
    </span>
  );
};

const StageBadge = ({ stage }: { stage: OpportunityStage }) => {
  const colors = {
    Discovery: 'bg-blue-100 text-blue-700 border-blue-200',
    Proposal: 'bg-amber-100 text-amber-700 border-amber-200',
    Negotiation: 'bg-purple-100 text-purple-700 border-purple-200',
    'Closed Won': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Closed Lost': 'bg-rose-100 text-rose-700 border-rose-200',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", colors[stage])}>
      {stage}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'customers' | 'opportunities' | 'tasks'>('dashboard');
  
  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isOpportunityModalOpen, setIsOpportunityModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    const customersQuery = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
    const interactionsQuery = query(collection(db, 'interactions'), where('ownerId', '==', user.uid));
    const tasksQuery = query(collection(db, 'tasks'), where('ownerId', '==', user.uid));
    const opportunitiesQuery = query(collection(db, 'opportunities'), where('ownerId', '==', user.uid));

    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));

    const unsubInteractions = onSnapshot(interactionsQuery, (snapshot) => {
      setInteractions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'interactions'));

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    const unsubOpportunities = onSnapshot(opportunitiesQuery, (snapshot) => {
      setOpportunities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'opportunities'));

    return () => {
      unsubCustomers();
      unsubInteractions();
      unsubTasks();
      unsubOpportunities();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Actions ---

  const saveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      company: formData.get('company') as string,
      status: formData.get('status') as CustomerStatus,
      source: formData.get('source') as string,
      ownerId: user.uid,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingCustomer?.id) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), data);
      } else {
        await addDoc(collection(db, 'customers'), { ...data, createdAt: new Date().toISOString() });
      }
      setIsCustomerModalOpen(false);
      setEditingCustomer(null);
    } catch (err) {
      handleFirestoreError(err, editingCustomer ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    }
  };

  const saveOpportunity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      customerId: formData.get('customerId') as string,
      title: formData.get('title') as string,
      value: Number(formData.get('value')),
      stage: formData.get('stage') as OpportunityStage,
      probability: Number(formData.get('probability')),
      expectedCloseDate: formData.get('expectedCloseDate') as string,
      ownerId: user.uid,
    };

    try {
      if (editingOpportunity?.id) {
        await updateDoc(doc(db, 'opportunities', editingOpportunity.id), data);
      } else {
        await addDoc(collection(db, 'opportunities'), { ...data, createdAt: new Date().toISOString() });
      }
      setIsOpportunityModalOpen(false);
      setEditingOpportunity(null);
    } catch (err) {
      handleFirestoreError(err, editingOpportunity ? OperationType.UPDATE : OperationType.CREATE, 'opportunities');
    }
  };

  const addInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedCustomer?.id) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      customerId: selectedCustomer.id,
      type: formData.get('type') as InteractionType,
      content: formData.get('content') as string,
      date: new Date().toISOString(),
      ownerId: user.uid,
    };

    try {
      await addDoc(collection(db, 'interactions'), data);
      setIsInteractionModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'interactions');
    }
  };

  const addTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedCustomer?.id) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      customerId: selectedCustomer.id,
      title: formData.get('title') as string,
      dueDate: formData.get('dueDate') as string,
      status: 'Pending' as TaskStatus,
      ownerId: user.uid,
    };

    try {
      await addDoc(collection(db, 'tasks'), data);
      setIsTaskModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!task.id) return;
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: task.status === 'Pending' ? 'Completed' : 'Pending'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tasks');
    }
  };

  // --- Derived Data ---

  const leads = useMemo(() => customers.filter(c => c.status === 'Lead'), [customers]);
  const activeCustomers = useMemo(() => customers.filter(c => c.status !== 'Lead'), [customers]);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filterFn = (item: any) => 
      (item.name || item.title || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      (item.company || '').toLowerCase().includes(q);

    return {
      leads: leads.filter(filterFn),
      customers: activeCustomers.filter(filterFn),
      opportunities: opportunities.filter(filterFn),
    };
  }, [leads, activeCustomers, opportunities, searchQuery]);

  const dashboardStats = useMemo(() => {
    const totalValue = opportunities
      .filter(o => o.stage !== 'Closed Lost')
      .reduce((sum, o) => sum + o.value, 0);

    const wonValue = opportunities
      .filter(o => o.stage === 'Closed Won')
      .reduce((sum, o) => sum + o.value, 0);

    const pipelineData = [
      { name: 'Discovery', value: opportunities.filter(o => o.stage === 'Discovery').length, color: '#3b82f6' },
      { name: 'Proposal', value: opportunities.filter(o => o.stage === 'Proposal').length, color: '#f59e0b' },
      { name: 'Negotiation', value: opportunities.filter(o => o.stage === 'Negotiation').length, color: '#a855f7' },
      { name: 'Won', value: opportunities.filter(o => o.stage === 'Closed Won').length, color: '#10b981' },
    ];

    const revenueData = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    }).map(month => {
      const monthStr = format(month, 'MMM');
      const monthWon = opportunities
        .filter(o => o.stage === 'Closed Won' && format(new Date(o.createdAt), 'MMM') === monthStr)
        .reduce((sum, o) => sum + o.value, 0);
      return { name: monthStr, revenue: monthWon };
    });

    return { totalValue, wonValue, pipelineData, revenueData };
  }, [opportunities]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center space-y-6 border border-gray-100">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Users className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Nexus CRM</h1>
            <p className="text-gray-500">Manage your leads, opportunities, and sales performance.</p>
          </div>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 text-gray-700 px-6 py-4 rounded-2xl font-semibold hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-30">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Users className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Nexus CRM</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'leads', icon: Target, label: 'Leads' },
            { id: 'customers', icon: Users, label: 'Customers' },
            { id: 'opportunities', icon: TrendingUp, label: 'Opportunities' },
            { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === item.id 
                  ? "bg-indigo-50 text-indigo-700" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-gray-200" alt="User" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        {activeTab === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-8">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Sales Dashboard</h1>
                <p className="text-gray-500">Performance overview and sales metrics.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  New Lead
                </button>
                <button 
                  onClick={() => { setEditingOpportunity(null); setIsOpportunityModalOpen(true); }}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  <TrendingUp className="w-5 h-5" />
                  New Deal
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Pipeline Value</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">${dashboardStats.totalValue.toLocaleString()}</p>
                <div className="mt-4 flex items-center gap-2 text-indigo-600 text-sm font-medium">
                  <TrendingUp className="w-4 h-4" />
                  <span>Total potential</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Revenue (Won)</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">${dashboardStats.wonValue.toLocaleString()}</p>
                <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <DollarSign className="w-4 h-4" />
                  <span>Closed deals</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Active Leads</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{leads.length}</p>
                <div className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-medium">
                  <Target className="w-4 h-4" />
                  <span>New prospects</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Win Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {opportunities.length ? Math.round((opportunities.filter(o => o.stage === 'Closed Won').length / opportunities.length) * 100) : 0}%
                </p>
                <div className="mt-4 flex items-center gap-2 text-purple-600 text-sm font-medium">
                  <CheckSquare className="w-4 h-4" />
                  <span>Conversion</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Revenue Trend (Last 6 Months)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardStats.revenueData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#6366f1" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Pipeline by Stage</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardStats.pipelineData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {dashboardStats.pipelineData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leads' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
              <button 
                onClick={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus className="w-5 h-5" />
                Add Lead
              </button>
            </header>

            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.leads.map(lead => (
                <div key={lead.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => setSelectedCustomer(lead)}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xl">
                      {lead.name.charAt(0)}
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{lead.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{lead.company || 'Private Individual'}</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Mail className="w-3 h-3" />
                      {lead.email || 'No email'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />
                      {lead.phone || 'No phone'}
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Added {format(new Date(lead.createdAt), 'MMM d, yyyy')}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingCustomer(lead); setIsCustomerModalOpen(true); }}
                      className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'opportunities' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">Opportunities</h1>
              <button 
                onClick={() => { setEditingOpportunity(null); setIsOpportunityModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus className="w-5 h-5" />
                New Deal
              </button>
            </header>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deal Title</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prob.</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.opportunities.map((opp) => {
                    const customer = customers.find(c => c.id === opp.customerId);
                    return (
                      <tr key={opp.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900">{opp.title}</p>
                          <p className="text-[10px] text-gray-400">Expected: {opp.expectedCloseDate || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600">{customer?.name || 'Unknown'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <StageBadge stage={opp.stage} />
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">${opp.value.toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${opp.probability}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{opp.probability}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => { setEditingOpportunity(opp); setIsOpportunityModalOpen(true); }}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                if (window.confirm('Delete this opportunity?')) {
                                  try { await deleteDoc(doc(db, 'opportunities', opp.id!)); }
                                  catch (err) { handleFirestoreError(err, OperationType.DELETE, 'opportunities'); }
                                }
                              }}
                              className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
              <button 
                onClick={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus className="w-5 h-5" />
                Add Customer
              </button>
            </header>

            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.customers.map((customer) => (
                    <tr 
                      key={customer.id} 
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                            {customer.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{customer.company || '---'}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); setIsCustomerModalOpen(true); }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
            </header>

            <div className="grid grid-cols-1 gap-4">
              {tasks.length > 0 ? (
                tasks.sort((a, b) => {
                  if (a.status === b.status) return new Date(a.dueDate || '').getTime() - new Date(b.dueDate || '').getTime();
                  return a.status === 'Pending' ? -1 : 1;
                }).map((task) => {
                  const customer = customers.find(c => c.id === task.customerId);
                  const isOverdue = task.status === 'Pending' && task.dueDate && isAfter(new Date(), new Date(task.dueDate));
                  
                  return (
                    <div key={task.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 group">
                      <button 
                        onClick={() => toggleTaskStatus(task)}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                          task.status === 'Completed' 
                            ? "bg-emerald-500 border-emerald-500 text-white" 
                            : "border-gray-300 hover:border-indigo-500"
                        )}
                      >
                        {task.status === 'Completed' && <CheckSquare className="w-4 h-4" />}
                      </button>
                      <div className="flex-1">
                        <h4 className={cn("font-semibold text-gray-900", task.status === 'Completed' && "line-through text-gray-400")}>
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-indigo-600 font-medium">{customer?.name}</span>
                          {task.dueDate && (
                            <span className={cn("text-xs flex items-center gap-1", isOverdue ? "text-red-500 font-bold" : "text-gray-400")}>
                              <Calendar className="w-3 h-3" />
                              {format(new Date(task.dueDate), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          if (window.confirm('Delete this task?')) {
                            try { await deleteDoc(doc(db, 'tasks', task.id!)); }
                            catch (err) { handleFirestoreError(err, OperationType.DELETE, 'tasks'); }
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300">
                  <CheckSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-500">All caught up! No pending tasks.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Customer Detail Sidebar */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)} />
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-100">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                  <StatusBadge status={selectedCustomer.status} />
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{selectedCustomer.email || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{selectedCustomer.phone || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Company</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{selectedCustomer.company || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Source</p>
                  <div className="flex items-center gap-2 text-gray-700">
                    <LayoutDashboard className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{selectedCustomer.source || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Interactions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Interactions</h3>
                  <button 
                    onClick={() => setIsInteractionModalOpen(true)}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Log Activity
                  </button>
                </div>
                <div className="space-y-4">
                  {interactions.filter(i => i.customerId === selectedCustomer.id).length > 0 ? (
                    interactions
                      .filter(i => i.customerId === selectedCustomer.id)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((interaction) => (
                        <div key={interaction.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">{interaction.type}</span>
                            <span className="text-[10px] text-gray-400">{format(new Date(interaction.date), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed">{interaction.content}</p>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-400 italic py-4">No interactions logged yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal 
        isOpen={isCustomerModalOpen} 
        onClose={() => { setIsCustomerModalOpen(false); setEditingCustomer(null); }} 
        title={editingCustomer ? "Edit Customer" : "Add New Lead/Customer"}
      >
        <form onSubmit={saveCustomer} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Full Name</label>
            <input name="name" defaultValue={editingCustomer?.name} required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
              <input name="email" type="email" defaultValue={editingCustomer?.email} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Phone</label>
              <input name="phone" defaultValue={editingCustomer?.phone} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Company</label>
            <input name="company" defaultValue={editingCustomer?.company} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
              <select name="status" defaultValue={editingCustomer?.status || 'Lead'} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="Lead">Lead</option>
                <option value="Contact">Contact</option>
                <option value="Customer">Customer</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Source</label>
              <input name="source" defaultValue={editingCustomer?.source} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all mt-4">
            {editingCustomer ? "Update" : "Create"}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isOpportunityModalOpen} 
        onClose={() => { setIsOpportunityModalOpen(false); setEditingOpportunity(null); }} 
        title={editingOpportunity ? "Edit Opportunity" : "New Opportunity"}
      >
        <form onSubmit={saveOpportunity} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Customer</label>
            <select name="customerId" defaultValue={editingOpportunity?.customerId} required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500">
              <option value="">Select Customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Deal Title</label>
            <input name="title" defaultValue={editingOpportunity?.title} required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Enterprise License" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Value ($)</label>
              <input name="value" type="number" defaultValue={editingOpportunity?.value} required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Probability (%)</label>
              <input name="probability" type="number" min="0" max="100" defaultValue={editingOpportunity?.probability || 50} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Stage</label>
              <select name="stage" defaultValue={editingOpportunity?.stage || 'Discovery'} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="Discovery">Discovery</option>
                <option value="Proposal">Proposal</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Closed Won">Closed Won</option>
                <option value="Closed Lost">Closed Lost</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Expected Close</label>
              <input name="expectedCloseDate" type="date" defaultValue={editingOpportunity?.expectedCloseDate} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all mt-4">
            {editingOpportunity ? "Update Deal" : "Create Deal"}
          </button>
        </form>
      </Modal>

      <Modal isOpen={isInteractionModalOpen} onClose={() => setIsInteractionModalOpen(false)} title="Log Interaction">
        <form onSubmit={addInteraction} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Type</label>
            <select name="type" className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500">
              <option value="Call">Call</option>
              <option value="Email">Email</option>
              <option value="Meeting">Meeting</option>
              <option value="Note">Note</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Details</label>
            <textarea name="content" rows={4} required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="What happened?"></textarea>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all mt-4">
            Save Interaction
          </button>
        </form>
      </Modal>

      <Modal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} title="Add Task">
        <form onSubmit={addTask} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Task Description</label>
            <input name="title" required className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Follow up on proposal" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Due Date</label>
            <input name="dueDate" type="date" className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all mt-4">
            Create Task
          </button>
        </form>
      </Modal>
    </div>
  );
}
