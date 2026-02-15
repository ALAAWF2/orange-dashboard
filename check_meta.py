import json

store_id = "1102"

try:
    with open('management_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        print("Loaded management_data.json")
        
        if 'store_meta' in data:
            if store_id in data['store_meta']:
                print(f"Store {store_id} META: {data['store_meta'][store_id]}")
            else:
                print(f"Store {store_id} NOT found in store_meta")
        else:
            print("No 'store_meta' key in data")

except Exception as e:
    print(f"Error checking management_data.json: {e}")
