# Errandly 0.6 Working Build

This is the development build for Errandly 0.6. The original Errandly 0.5 ZIP remains the protected baseline.

## Before deployment
1. Apply `supabase-0.6-migration.sql` once in the Supabase SQL Editor.
2. Confirm the existing owner/admin account can sign in to `admin.html`.
3. Create at least one runner in `public.runners` for assignment testing.
4. Test customer registration, authenticated order creation, customer-only order visibility, admin order management, runner assignment, and the cancellation/modification rule.
5. The customer home/history screens read orders from Supabase; browser localStorage is not used as an order source.
6. Only after successful testing should this build be deployed.

## 0.6 security rules
- Anonymous visitors cannot create orders.
- Authenticated customers can create and view only their own orders.
- Admin/owner accounts can manage all orders.
- Customers can modify/cancel before runner assignment.
- Once a runner is assigned, customers can still modify, but cannot cancel.
- Existing 0.5 orders without `customer_id` remain available to admins but are not guessed/assigned to a customer.

### Customer order lifecycle rule

- **No runner assigned:** customer can modify or cancel the order.
- **Runner assigned:** customer can still modify the order, but cannot cancel it.

## Final hardening included
- Customer order history and upcoming scheduled errands are loaded from Supabase, not localStorage.
- Customer profile role/identity metadata cannot be changed by a customer.
- Errand status values are constrained to the supported lifecycle.
- Runner assignments reference real runners.
- Order IDs are unique at the database level.
