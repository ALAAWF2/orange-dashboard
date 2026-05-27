import json
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
showrooms_path = os.path.join(base_dir, "showrooms.json")
mgmt_path = os.path.join(base_dir, "allorangedashboard", "management_data.json")

# 1. Load active data
with open(mgmt_path, "r", encoding="utf-8") as f:
    mgmt_data = json.load(f)

stores = mgmt_data.get("stores", {})
store_meta = mgmt_data.get("store_meta", {})

# 2. Load showrooms mapping
with open(showrooms_path, "r", encoding="utf-8") as f:
    showrooms = json.load(f)

updated_count = 0
for item in showrooms:
    codes = item.get("codes", [])
    if not codes or not codes[0]:
        continue
    
    # Extract store ID from the code (e.g. "1001" from "1001-C")
    store_id = codes[0].split("-")[0].strip()
    
    if store_id in store_meta:
        meta = store_meta[store_id]
        active_manager = meta.get("manager", "Unknown")
        
        # If manager is Unknown and city is jeddah, map to "المنطقة الغربية"
        if active_manager == "Unknown" and meta.get("city") == "jeddah":
            active_manager = "المنطقة الغربية"
            
        active_name = stores.get(store_id, item["name"])
        
        # Update showrooms item
        item["manager"] = active_manager
        item["name"] = f"{store_id}-{active_name}"
        updated_count += 1
        print(f"Synced ID: {store_id} -> Name: {item['name']} | Manager: {item['manager']}")

# 3. Save showrooms back
with open(showrooms_path, "w", encoding="utf-8") as f:
    json.dump(showrooms, f, ensure_ascii=False, indent=4)

print(f"\nSuccessfully synced {updated_count} showrooms inside showrooms.json")
