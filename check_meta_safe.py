import json
import sys

# Force utf-8 for stdout
sys.stdout.reconfigure(encoding='utf-8')

store_id = "1102"

try:
    with open('management_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        print("Loaded management_data.json")
        
        if 'store_meta' in data:
            if store_id in data['store_meta']:
                meta = data['store_meta'][store_id]
                print(f"Store {store_id} META found.")
                print(f"Name: {meta.get('name', 'N/A')}")
                print(f"Name AR: {meta.get('name_ar', 'N/A')}")
                print(f"Manager: {meta.get('manager', 'N/A')}")
                print(f"Region: {meta.get('region', 'N/A')}")
            else:
                print(f"Store {store_id} NOT found in store_meta")
        else:
            print("No 'store_meta' key in data")

except Exception as e:
    print(f"Error: {e}")
