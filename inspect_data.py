import json

product_id = "48890200"
store_id = "1102"
store_name_part = "Riyadh Othaim Mall"

print(f"Inspecting data for Product: {product_id}, Store ID: {store_id}")

try:
    with open('product_analysis_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        print("Loaded product_analysis_data.json")
        
        # Check structure - assuming it might be a list or dict
        # Based on name, maybe it keys by product_id?
        if isinstance(data, dict):
            if product_id in data:
                print(f"Product found in product_analysis_data.json")
                prod_data = data[product_id]
                print(f"Data type for product: {type(prod_data)}")
                if isinstance(prod_data, dict):
                    if store_id in prod_data:
                        print(f"Store {store_id} found in product data: {prod_data[store_id]}")
                    else:
                        print(f"Store {store_id} NOT found in product data.")
                        print(f"Available stores: {list(prod_data.keys())}")
                elif isinstance(prod_data, list):
                     print("Product data is a list, inspecting items...")
                     found = False
                     for item in prod_data:
                         # Assuming item might have store_id or branch_id
                         if str(item.get('branch_id')) == store_id or str(item.get('store_id')) == store_id:
                             print(f"Store found in list: {item}")
                             found = True
                     if not found:
                         print("Store not found in product data list.")
            else:
                print(f"Product {product_id} NOT found in product_analysis_data.json")
        else:
             print("Root data is not a dict")

except Exception as e:
    print(f"Error reading product_analysis_data.json: {e}")

try:
    with open('stock_data.json', 'r', encoding='utf-8') as f:
        stock_data = json.load(f)
        print("\nLoaded stock_data.json")
        # Structure seemed to be {"stock": {"prod_id": {"store_id": qty}}} from previous view_file
        if "stock" in stock_data:
            stocks = stock_data["stock"]
            if product_id in stocks:
                print(f"Product found in stock_data.json")
                prod_stock = stocks[product_id]
                if store_id in prod_stock:
                    print(f"Stock for store {store_id}: {prod_stock[store_id]}")
                else:
                    print(f"Store {store_id} NOT found in stock data for this product.")
            else:
                print(f"Product {product_id} NOT found in stock_data.json")

except Exception as e:
    print(f"Error reading stock_data.json: {e}")
