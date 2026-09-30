-- Read-only counts. Run before and after migration while all writers are stopped.
SELECT 'activity_logs' AS table_name, COUNT(*) AS row_count FROM `activity_logs`
UNION ALL
SELECT 'app_update_reads' AS table_name, COUNT(*) AS row_count FROM `app_update_reads`
UNION ALL
SELECT 'app_updates' AS table_name, COUNT(*) AS row_count FROM `app_updates`
UNION ALL
SELECT 'attachments' AS table_name, COUNT(*) AS row_count FROM `attachments`
UNION ALL
SELECT 'brands' AS table_name, COUNT(*) AS row_count FROM `brands`
UNION ALL
SELECT 'clients' AS table_name, COUNT(*) AS row_count FROM `clients`
UNION ALL
SELECT 'crm_price_change_requests' AS table_name, COUNT(*) AS row_count FROM `crm_price_change_requests`
UNION ALL
SELECT 'division_item_group_instances' AS table_name, COUNT(*) AS row_count FROM `division_item_group_instances`
UNION ALL
SELECT 'division_types' AS table_name, COUNT(*) AS row_count FROM `division_types`
UNION ALL
SELECT 'item_completion' AS table_name, COUNT(*) AS row_count FROM `item_completion`
UNION ALL
SELECT 'item_group_items' AS table_name, COUNT(*) AS row_count FROM `item_group_items`
UNION ALL
SELECT 'item_groups' AS table_name, COUNT(*) AS row_count FROM `item_groups`
UNION ALL
SELECT 'manual_product_requests' AS table_name, COUNT(*) AS row_count FROM `manual_product_requests`
UNION ALL
SELECT 'messages' AS table_name, COUNT(*) AS row_count FROM `messages`
UNION ALL
SELECT 'notifications' AS table_name, COUNT(*) AS row_count FROM `notifications`
UNION ALL
SELECT 'oauth_tokens' AS table_name, COUNT(*) AS row_count FROM `oauth_tokens`
UNION ALL
SELECT 'order_items' AS table_name, COUNT(*) AS row_count FROM `order_items`
UNION ALL
SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM `orders`
UNION ALL
SELECT 'panel_completion' AS table_name, COUNT(*) AS row_count FROM `panel_completion`
UNION ALL
SELECT 'panel_crm_items' AS table_name, COUNT(*) AS row_count FROM `panel_crm_items`
UNION ALL
SELECT 'panel_divisions' AS table_name, COUNT(*) AS row_count FROM `panel_divisions`
UNION ALL
SELECT 'panel_manual_products' AS table_name, COUNT(*) AS row_count FROM `panel_manual_products`
UNION ALL
SELECT 'product_discounts' AS table_name, COUNT(*) AS row_count FROM `product_discounts`
UNION ALL
SELECT 'product_reservations' AS table_name, COUNT(*) AS row_count FROM `product_reservations`
UNION ALL
SELECT 'products' AS table_name, COUNT(*) AS row_count FROM `products`
UNION ALL
SELECT 'project_crm_panels' AS table_name, COUNT(*) AS row_count FROM `project_crm_panels`
UNION ALL
SELECT 'project_engineer_requests' AS table_name, COUNT(*) AS row_count FROM `project_engineer_requests`
UNION ALL
SELECT 'project_items' AS table_name, COUNT(*) AS row_count FROM `project_items`
UNION ALL
SELECT 'project_payments' AS table_name, COUNT(*) AS row_count FROM `project_payments`
UNION ALL
SELECT 'project_procurement_allocations' AS table_name, COUNT(*) AS row_count FROM `project_procurement_allocations`
UNION ALL
SELECT 'project_stage_history' AS table_name, COUNT(*) AS row_count FROM `project_stage_history`
UNION ALL
SELECT 'project_technicians' AS table_name, COUNT(*) AS row_count FROM `project_technicians`
UNION ALL
SELECT 'projects' AS table_name, COUNT(*) AS row_count FROM `projects`
UNION ALL
SELECT 'quotation_revisions' AS table_name, COUNT(*) AS row_count FROM `quotation_revisions`
UNION ALL
SELECT 'reservation_history' AS table_name, COUNT(*) AS row_count FROM `reservation_history`
UNION ALL
SELECT 'workers' AS table_name, COUNT(*) AS row_count FROM `workers`
ORDER BY table_name;
SELECT 'projects_total_price' AS metric, COALESCE(SUM(total_price),0) AS value FROM projects UNION ALL SELECT 'projects_total_with_vat', COALESCE(SUM(total_with_vat),0) FROM projects UNION ALL SELECT 'payments_amount', COALESCE(SUM(amount),0) FROM project_payments UNION ALL SELECT 'products_stock', COALESCE(SUM(stock_qty),0) FROM products UNION ALL SELECT 'clients_credit_limit', COALESCE(SUM(credit_limit),0) FROM clients UNION ALL SELECT 'discount_percentages', COALESCE(SUM(discount_pct),0) FROM product_discounts ORDER BY metric;
