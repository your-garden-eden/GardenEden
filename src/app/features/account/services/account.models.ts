// src/app/features/account/services/account.models.ts

export interface WpUserMeResponse {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  meta?: any;
  avatar_urls?: { [key: string]: string };
  roles?: string[];
}

export interface BillingAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
}

export interface ShippingAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone?: string;
}

// KORREKTUR: 'export' hinzugefügt, um das Interface verfügbar zu machen.
export interface UserAddressesResponse {
  billing: BillingAddress;
  shipping: ShippingAddress;
}

export interface WooCommerceCustomer {
  id: number;
  date_created?: string;
  date_created_gmt?: string;
  date_modified?: string;
  date_modified_gmt?: string;
  email: string;
  first_name: string;
  last_name: string;
  role?: string;
  username?: string;
  billing: BillingAddress;
  shipping: ShippingAddress;
  is_paying_customer?: boolean;
  avatar_url?: string;
}

export interface WooCommerceOrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  tax_class: string;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  taxes: any[];
  meta_data: any[];
  sku: string | null;
  price: number;
  image?: {
    id: number | string;
    src: string;
  };
  parent_name: string | null;
}

export interface WooCommerceOrder {
  id: number;
  parent_id: number;
  status: string;
  currency: string;
  version: string;
  prices_include_tax: boolean;
  date_created: string;
  date_modified: string;
  discount_total: string;
  discount_tax: string;
  shipping_total: string;
  shipping_tax: string;
  cart_tax: string;
  total: string;
  total_tax: string;
  customer_id: number;
  order_key: string;
  billing: BillingAddress;
  shipping: ShippingAddress;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_ip_address: string;
  customer_user_agent: string;
  created_via: string;
  customer_note: string;
  date_completed: string | null;
  date_paid: string | null;
  cart_hash: string;
  number: string;
  line_items: WooCommerceOrderLineItem[];
  tax_lines: any[];
  shipping_lines: any[];
  fee_lines: any[];
  coupon_lines: any[];
  refunds: any[];
}

export interface PaginatedOrdersResponse {
  orders: WooCommerceOrder[];
  totalOrders: number;
  totalPages: number;
}

export interface WooCommerceCustomerUpdatePayload {
  billing?: BillingAddress;
  shipping?: ShippingAddress;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface OrderDetailsPayload {
    orderId: number;
}

export interface UserProfile {
    wpUser: WpUserMeResponse;
    wooCustomer: WooCommerceCustomer;
}