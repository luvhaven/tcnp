import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  TNCP_CALL_SIGN_COLORS,
  getCallSignDefinition,
  resolveCallSignKey
} from '@/lib/constants/tncpCallSigns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (format === 'time') {
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  if (format === 'long') {
    return d.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(d, 'short');
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getRoleDisplayName(role: string): string {
  const roleMap: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    captain: 'Captain',
    head_of_command: 'Head of Command',
    delta_oscar: 'Delta Oscar (DO)',
    tango_oscar: 'Tango Oscar (TO)',
    head_tango_oscar: 'Head Tango Oscar',
    alpha_oscar: 'Alpha Oscar (AO)',
    november_oscar: 'November Oscar (NO)',
    victor_oscar: 'Victor Oscar (VO)',
    viewer: 'Viewer',
    media: 'Media',
    external: 'External',
  };
  
  return roleMap[role] || role;
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    planned: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    arriving: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    at_nest: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    departing_nest: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    enroute_to_theatre: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    at_theatre: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    departing_theatre: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    distress: 'bg-red-600 text-white animate-pulse',
  };
  
  return statusColors[status] || 'bg-gray-100 text-gray-800';
}

export function getCallSignColor(callSign: string): string {
  const key = resolveCallSignKey(callSign) ?? resolveCallSignKey(getCallSignDefinition(callSign)?.label ?? '')

  if (key && key in TNCP_CALL_SIGN_COLORS) {
    return TNCP_CALL_SIGN_COLORS[key]
  }

  return 'bg-gray-600 text-white'
}

export function getSeverityColor(severity: string): string {
  const severityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  
  return severityColors[severity] || 'bg-gray-100 text-gray-800';
}

export function getVehicleStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    idle: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    on_mission: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    disabled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  
  return statusColors[status] || 'bg-gray-100 text-gray-800';
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export function calculateETA(
  currentLat: number,
  currentLon: number,
  destLat: number,
  destLon: number,
  averageSpeed: number = 40 // km/h
): Date {
  const distance = calculateDistance(currentLat, currentLon, destLat, destLon);
  const hours = distance / averageSpeed;
  const eta = new Date();
  eta.setHours(eta.getHours() + hours);
  return eta;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function parsePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Format Nigerian numbers
  if (digits.startsWith('234')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  
  if (digits.startsWith('0')) {
    return `+234 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  
  return phone;
}

export function generateColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export function isAdmin(role: string): boolean {
  return ['super_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations'].includes(role);
}

export function canManageJourney(role: string, isAssignedDO: boolean): boolean {
  if (isAdmin(role)) return true;
  if (role === 'delta_oscar' && isAssignedDO) return true;
  return false;
}

export function canManageFleet(role: string): boolean {
  if (isAdmin(role)) return true;
  return ['tango_oscar', 'head_tango_oscar'].includes(role);
}

export function canManageUsers(role: string): boolean {
  return isAdmin(role);
}

export function canManagePapas(role: string): boolean {
  // Papas are primarily managed by admin-level roles
  return isAdmin(role);
}

export function canManageNests(role: string): boolean {
  // Nests (hotels) are managed by admins and November Oscars
  if (isAdmin(role)) return true;
  return role === 'november_oscar';
}

export function canManageEagles(role: string): boolean {
  // Eagle Squares and flight tracking are managed by admins and Alpha Oscars
  if (isAdmin(role)) return true;
  return role === 'alpha_oscar';
}
