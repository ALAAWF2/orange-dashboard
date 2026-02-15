import json
import os

store_id = "1102"
product_id = "48890200"

files_to_check = [
    'product_analysis_data.json',
    'inquiry_stats.json',
    'stock_data.json'
]

for filename in files_to_check:
    print(f"--- Checking {filename} ---")
    if not os.path.exists(filename):
        print(f"File not found.")
        continue
        
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            if filename == 'product_analysis_data.json':
                # Check periods -> analysis -> store_id
                if 'periods' in data:
                    for period, p_data in data['periods'].items():
                        if 'analysis' in p_data:
                            if store_id in p_data['analysis']:
                                print(f"Store {store_id} FOUND in periods.{period}.analysis")
                                # details = p_data['analysis'][store_id]
                                # print(f"Store Data Keys: {list(details.keys())}")
                            else:
                                print(f"Store {store_id} MISSING in periods.{period}.analysis")
                        else:
                            print(f"No 'analysis' key in periods.{period}")
                            
                # Check market_basket
                if 'market_basket' in data:
                    if store_id in data['market_basket']:
                         print(f"Store {store_id} FOUND in market_basket")
                    else:
                         print(f"Store {store_id} MISSING in market_basket")

            elif filename == 'inquiry_stats.json':
                # Guessing structure based on usage... usually keys are products or items
                # Or maybe it has a stores section?
                # Let's inspect root keys first if it's a dict
                if isinstance(data, dict):
                    # Check if product exists
                    if product_id in data:
                         print(f"Product {product_id} FOUND in root")
                         # Check if store is in product details
                         prod_details = data[product_id]
                         if isinstance(prod_details, dict):
                             # Maybe it has breakdown by store?
                             found_store = False
                             for key, val in prod_details.items():
                                 if key == store_id:
                                     print(f"Store {store_id} FOUND in product {product_id} details: {val}")
                                     found_store = True
                             if not found_store:
                                 print(f"Store {store_id} NOT found in product {product_id} details (Keys: {list(prod_details.keys())})")
                    else:
                         print(f"Product {product_id} NOT found in root")
                    
                    # Also check if keys are stores?
                    if store_id in data:
                        print(f"Store {store_id} FOUND as root key")

            elif filename == 'stock_data.json':
                 # Structure: {"stock": {prod_id: {store_id: qty}}}
                 if 'stock' in data:
                     if product_id in data['stock']:
                         p_stock = data['stock'][product_id]
                         if store_id in p_stock:
                             print(f"Stock for store {store_id}: {p_stock[store_id]}")
                         else:
                             print(f"Store {store_id} has NO stock for product {product_id}")
                     else:
                         print(f"Product {product_id} NOT found in stock")

    except Exception as e:
        print(f"Error reading {filename}: {e}")
    print("\n")
