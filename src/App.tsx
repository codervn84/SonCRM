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
  Trash2
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
  Pie
} from 'recharts';
import { format, isAfter, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db } from './firebase';
import { 
  Customer, 
  Interaction, 
  Task, 
  CustomerStatus, 
  InteractionType, 
  TaskStatus,
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
        <div className="p-6">{children}</div>
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

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'customers' | 'tasks'>('dashboard');
  
  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

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

    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));

    const unsubInteractions = onSnapshot(interactionsQuery, (snapshot) => {
      setInteractions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'interactions'));

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    return () => {
      unsubCustomers();
      unsubInteractions();
      unsubTasks();
    };
  }, [user]);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

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

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [customers, searchQuery]);

  const dashboardStats = useMemo(() => {
    const statusCounts = customers.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const chartData = [
      { name: 'Leads', value: statusCounts['Lead'] || 0, color: '#3b82f6' },
      { name: 'Contacts', value: statusCounts['Contact'] || 0, color: '#a855f7' },
      { name: 'Customers', value: statusCounts['Customer'] || 0, color: '#10b981' },
      { name: 'Inactive', value: statusCounts['Inactive'] || 0, color: '#6b7280' },
    ];

    const recentInteractions = [...interactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    const pendingTasks = tasks.filter(t => t.status === 'Pending');

    return { chartData, recentInteractions, pendingTasks };
  }, [customers, interactions, tasks]);

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
            <p className="text-gray-500">Manage your customer relationships with ease and precision.</p>
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
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Users className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Nexus CRM</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'customers', icon: Users, label: 'Customers' },
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
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500">Welcome back, {user.displayName?.split(' ')[0]}!</p>
              </div>
              <button 
                onClick={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus className="w-5 h-5" />
                New Customer
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Total Customers</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{customers.length}</p>
                <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <ChevronRight className="w-4 h-4" />
                  <span>Active pipeline</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Pending Tasks</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{dashboardStats.pendingTasks.length}</p>
                <div className="mt-4 flex items-center gap-2 text-amber-600 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  <span>Needs attention</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-sm font-medium text-gray-500">Recent Interactions</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{interactions.length}</p>
                <div className="mt-4 flex items-center gap-2 text-indigo-600 text-sm font-medium">
                  <MessageSquare className="w-4 h-4" />
                  <span>Last 30 days</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Customer Pipeline</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardStats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {dashboardStats.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Recent Activity</h3>
                <div className="space-y-6">
                  {dashboardStats.recentInteractions.length > 0 ? (
                    dashboardStats.recentInteractions.map((interaction) => {
                      const customer = customers.find(c => c.id === interaction.customerId);
                      return (
                        <div key={interaction.id} className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                            <MessageSquare className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-900">
                              <span className="font-semibold">{interaction.type}</span> with{' '}
                              <span className="font-semibold text-indigo-600">{customer?.name || 'Unknown'}</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{format(new Date(interaction.date), 'MMM d, h:mm a')}</p>
                            <p className="text-sm text-gray-600 mt-2 line-clamp-1 italic">"{interaction.content}"</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                      <p className="text-gray-500">No recent activity found.</p>
                    </div>
                  )}
                </div>
              </div>
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

            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, email, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Update</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
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
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {customer.company || '---'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-gray-500">{format(new Date(customer.updatedAt), 'MMM d, yyyy')}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); setIsCustomerModalOpen(true); }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              if (window.confirm('Are you sure you want to delete this customer?')) {
                                try { await deleteDoc(doc(db, 'customers', customer.id!)); }
                                catch (err) { handleFirestoreError(err, OperationType.DELETE, 'customers'); }
                              }
                            }}
                            className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-500">No customers found matching your search.</p>
                      </td>
                    </tr>
                  )}
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

              {/* Tasks */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Tasks</h3>
                  <button 
                    onClick={() => setIsTaskModalOpen(true)}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Task
                  </button>
                </div>
                <div className="space-y-3">
                  {tasks.filter(t => t.customerId === selectedCustomer.id).length > 0 ? (
                    tasks
                      .filter(t => t.customerId === selectedCustomer.id)
                      .map((task) => (
                        <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors group">
                          <button 
                            onClick={() => toggleTaskStatus(task)}
                            className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                              task.status === 'Completed' ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300"
                            )}
                          >
                            {task.status === 'Completed' && <CheckSquare className="w-3 h-3" />}
                          </button>
                          <div className="flex-1">
                            <p className={cn("text-sm font-medium", task.status === 'Completed' && "line-through text-gray-400")}>{task.title}</p>
                            {task.dueDate && <p className="text-[10px] text-gray-400">{format(new Date(task.dueDate), 'MMM d')}</p>}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-400 italic py-4">No tasks assigned.</p>
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
        title={editingCustomer ? "Edit Customer" : "Add New Customer"}
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
            {editingCustomer ? "Update Customer" : "Create Customer"}
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
