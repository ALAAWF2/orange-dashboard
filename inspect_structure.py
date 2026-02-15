import json

def print_structure(d, indent=0, max_depth=2):
    if indent > max_depth:
        return
    
    if isinstance(d, dict):
        keys = list(d.keys())
        print("  " * indent + f"Dict with {len(keys)} keys. Sample keys: {keys[:5]}")
        for k in keys[:3]: # Print structure of first few keys
            print("  " * indent + f"Key: {k}")
            print_structure(d[k], indent + 1, max_depth)
            
    elif isinstance(d, list):
        print("  " * indent + f"List with {len(d)} items.")
        if d:
            print("  " * indent + "Item 0 structure:")
            print_structure(d[0], indent + 1, max_depth)

try:
    with open('product_analysis_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        print("Loaded product_analysis_data.json")
        print_structure(data)
        
        # Search recursively for the value
        search_val = "48890200"
        print(f"\nSearching for {search_val}...")
        
        found_paths = []
        
        def search_json(obj, path):
            if len(found_paths) >= 5: return # Stop after 5 matches
            
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if search_val in str(k):
                        found_paths.append(path + [f"Key: {k}"])
                    search_json(v, path + [k])
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    search_json(item, path + [f"Index {i}"])
            elif search_val in str(obj):
                found_paths.append(path + [f"Value: {obj}"])

        # Create a smaller chunk to search if file is huge, or just guard recursion depth if needed
        # But here we do full search since grep found it
        search_json(data, [])
        
        for p in found_paths:
            print(" -> ".join(map(str, p)))

except Exception as e:
    print(f"Error: {e}")
