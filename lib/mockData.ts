export interface ProductAddOn {
  id: string;
  name: string;          // e.g. "Extra Cheese", "Extra Beef Patty"
  priceUGX: number;      // additional price per add-on unit
  category?: string;     // optional grouping, e.g. "Toppings"
}

export interface Product {
  id: string;
  name: string;
  price: number; // in UGX
  category: string;
  categoryId?: string;
  image: string;
  available: boolean;
  requiresKitchen?: boolean; // false for canned drinks, water, etc.
  description?: string;
  branchId?: string;
  branchName?: string;
  recipe?: { ingredientId: string; quantity: number }[];
  linkedIngredientId?: string; // Linked inventory item for auto-deduction
  deductFromInventory?: boolean; // If true, selling this product reduces inventory
  inventoryDeductAmount?: number; // How many units to deduct per sale
  addOns?: ProductAddOn[];       // Configurable extras sold with this menu item
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  city?: string;
  manager: string;
  phone: string;
  email?: string;
  taxId?: string;
  address?: string;
  receiptHeaderNote?: string;
  receiptFooterNote?: string;
  tablesCount: number;
  dailyRevenueUGX: number;
  ordersToday: number;
  status: 'online' | 'busy' | 'maintenance';
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  pinCode?: string; // 4-digit PIN lock code
  idType?: 'National ID' | 'Passport' | 'Student ID';
  idNumber?: string;
  role: 'Super Admin' | 'Restaurant Admin' | 'Branch Manager' | 'Head Chef' | 'Senior Waiter' | 'Cashier' | 'Kitchen Staff';
  branch: string;
  assignedBranchId?: string;
  status: 'active' | 'on_shift' | 'off_shift' | 'on_leave' | 'paused' | 'banned';
  avatar: string;
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  category: string;
  costPerUnitUGX: number;
  supplier: string;
  branchId?: string;
  branchName?: string;
  deductFromSales?: boolean;       // Auto-deduct when linked product sold
  linkedProductId?: string;        // Product that triggers deduction
  deductAmountPerSale?: number;    // Units to deduct per unit sold
}

export interface CompanyProfile {
  id: string;
  name: string;
  taxId: string;
  creditLimitUGX: number;
  currentBalanceUGX: number;
  contactPerson: string;
  phone: string;
  status: 'active' | 'suspended' | 'closed';
  createdAt: number;
  branchId?: string;
  branchName?: string;
}

export interface CompanyStaff {
  id: string;
  companyId: string;
  name: string; // Required
  workId?: string; // Optional Work ID
  email?: string;
  department?: string;
  creditLimitUGX?: number;
  status: 'active' | 'inactive' | 'banned';
  totalSpentUGX?: number;
}

export interface ProductIngredient {
  id: string;
  productId: string;
  ingredientId: string;
  quantityPerUnit: number;
  branchId?: string;
  createdAt?: number;
}

export interface PlaceZone {
  id: string;
  name: string;
  icon: string;
  description: string;
  branchId?: string;
  branchName?: string;
  tables: { tableNumber: string; seatsCount: number; shape?: 'round' | 'rectangle'; seats?: string[]; status?: 'available' | 'occupied' | 'reserved' }[];
}

export interface Expense {
  id: string;
  branchId?: string;
  branchName?: string;
  title: string;
  category: 'Rent & Lease' | 'Utilities & Electricity' | 'Salaries & Wages' | 'Raw Material Stock' | 'Equipment & Repairs' | 'Marketing' | 'General';
  amountUGX: number;
  vatAmountUGX: number;
  receiptUrl?: string;
  notes?: string;
  createdAt: number;
}

export interface SplitPayment {
  id: string;
  amount: number;
  paymentMethod: 'Cash' | 'MTN Mobile Money' | 'Airtel Money' | 'Credit Card' | 'Corporate Credit';
  paidAt: number;
  splitIndex: number;
  totalSplits: number;
  itemsCovered?: string[];
  seatCovered?: string;
  guestLabel?: string;
  guestItems?: { id?: string; name: string; price: number; quantity: number; amount: number }[];
  note?: string;
}

export interface OrderItem {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  category?: string;
  image?: string;
  addOns?: { name: string; price: number }[];
}

export interface Order {
  id: string;
  table: string; // e.g. "Table 12"
  place?: string; // e.g. "Garden"
  seat?: string; // e.g. "Seat 2"
  type: 'Dine In' | 'Takeaway' | 'Delivery';
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid';
  paidAmount?: number;
  splitPayments?: SplitPayment[];
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'Cash' | 'MTN Mobile Money' | 'Airtel Money' | 'Credit Card' | 'Corporate Credit';
  isCorporateCredit?: boolean;
  companyId?: string;
  companyName?: string;
  companyStaffId?: string;
  companyStaffName?: string;
  workId?: string;
  prepEstimatedMinutes?: number;
  prepStartedAt?: number;
  prepCompletedAt?: number;
  restaurantId: string;
  branchId?: string;
  branchName: string;
  userId: string;
  createdAt: number;
  tinNumber?: string; // Customer TIN for VAT invoices
  notes?: string;
  amountReceived?: number;
  change?: number;
}

export interface AuditLog {
  id: string;
  userEmail: string;
  userId?: string;
  userName?: string;
  role?: string;
  action: string;
  section?: string;
  pcInfo?: string;
  details: Record<string, any>;
  ipAddress?: string;
  timestamp: number;
  branchId?: string;
  branchName?: string;
}

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: 'sale_deduction' | 'manual_add' | 'manual_deduct' | 'purchase' | 'waste';
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  orderId?: string;
  productName?: string;
  branchId?: string;
  branchName?: string;
  performedBy?: string;
  createdAt: number;
}

export const formatUGX = (amount: number | null | undefined): string => {
  const num = Number(amount) || 0;
  const formatted = Math.round(num).toLocaleString('en-UG');
  return `USh ${formatted}`;
};

export const PAYMENT_METHODS = [
  { id: 'Cash', label: 'Cash', color: 'green' },
  { id: 'MTN Mobile Money', label: 'MTN MoMo', color: 'yellow' },
  { id: 'Airtel Money', label: 'Airtel Money', color: 'red' },
  { id: 'Credit Card', label: 'Card', color: 'blue' },
  { id: 'Corporate Credit', label: 'Corporate Credit', color: 'orange' },
] as const;

// All data is now loaded from the API/database — no mock arrays needed.

export interface PrintJob {
  id: string;
  orderId: string;
  type: 'KITCHEN_TICKET' | 'BILL' | 'CUSTOMER_RECEIPT';
  destination: string;
  printerId?: string;
  payload: string;
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED';
  attempts: number;
  createdAt: number;
  lastError?: string | null;
  printedAt?: number | null;
  branchId?: string;
  branchName?: string;
}
