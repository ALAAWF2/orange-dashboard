import json
import pandas as pd
from datetime import datetime

# Load data
with open('ceo_data/meta.json', 'r', encoding='utf-8') as f:
    meta = json.load(f)

with open('ceo_data/products.json', 'r', encoding='utf-8') as f:
    products_obj = json.load(f)
products = products_obj['products']

with open('categories_map.json', 'r', encoding='utf-8') as f:
    cat_map = json.load(f)

# Load sales data (March)
with open('ceo_data/sales_2026_03.json', 'r', encoding='utf-8') as f:
    sales_03 = json.load(f)['records']

date_from = '2026-03-07'
date_to = '2026-03-09'

# Filter records
filtered_records = [r for r in sales_03 if date_from <= r['d'] <= date_to]

# Aggregate item_id
item_agg = {}
for r in filtered_records:
    pid = r['i']
    if pid not in item_agg:
        item_agg[pid] = {'qty': 0, 'amount': 0}
    item_agg[pid]['qty'] += r['q']
    item_agg[pid]['amount'] += r['a']

# Build results
results = []
for pid, val in item_agg.items():
    if pid.startswith('300') or pid.startswith('290'):
        continue
    prod = products.get(pid)
    if not prod:
        continue
        
    total_stock = prod.get('stock', {}).get('total', 0)
    
    results.append({
        'item_id': pid,
        'alias': prod.get('alias', ''),
        'name': prod.get('name', ''),
        'category': prod.get('category', ''),
        'price': prod.get('price', 0),
        'qty': val['qty'],
        'amount': round(val['amount'] * 100) / 100,
        'stock_total': total_stock
    })

# Group by category exactly as in rep.html
grouped_data = {}

for r in results:
    mapped_category = cat_map.get(str(r['item_id']))
    
    group_key = f"CAT_{mapped_category}" if mapped_category else f"PID_{r['item_id']}"
    
    if group_key not in grouped_data:
        grouped_data[group_key] = {
            'qty': 0,
            'amount': 0,
            'stock': 0,
            'topProduct': r,
            '_maxAmount': -1,
            '_maxQty': -1
        }
        
    g = grouped_data[group_key]
    g['qty'] += r['qty']
    g['amount'] += r['amount']
    # Careful: stock summation might duplicate if multiple items share a category. Yes, this is what's requested.
    g['stock'] += r['stock_total']
    
    # Track top product by amount for the Amount report, and top product by qty for the Qty report
    # We will use Amount to determine top product as standard, as in JS
    if r['amount'] > g['_maxAmount']:
        g['_maxAmount'] = r['amount']
        g['topProduct'] = r

# Convert to list and sort by QTY
grouped_array = list(grouped_data.values())

top_qty = sorted(grouped_array, key=lambda x: x['qty'], reverse=True)

print("--- TOP BY QTY (Top 10) ---")
for i, g in enumerate(top_qty[:10]):
    p = g['topProduct']
    selling_price = round(g['amount'] / g['qty'], 2) if g['qty'] > 0 else 0
    print(f"{i+1} | {p['item_id']} | {p['name'][:30]} | {p['alias']} | Stock: {g['stock']} | MRP: {p['price']} | Selling P: {selling_price} | QTY: {g['qty']} | AMOUNT: {round(g['amount'], 2)}")

print("\n--- INDIVIDUAL ITEM CHECK FOR 4489411 (Should be standalone) ---")
for g in grouped_array:
    if g['topProduct']['item_id'] == '4489411':
        p = g['topProduct']
        print(f"Standalone Item: {p['item_id']} | {p['name'][:30]} | {p['alias']} | QTY: {g['qty']} | AMOUNT: {round(g['amount'], 2)}")

