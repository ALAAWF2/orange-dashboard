import os
import json
import requests
import pandas as pd
import msal
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from pathlib import Path

# =========================
# CONFIG
# =========================
MAPPING_FILE = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/dynamic/mapping.xlsx")
TABLE5_SHEET = "Sheet1"
# TABLE6_SHEET = "Table6" # Disabled in new setup
OUTPUT_PRODUCTS = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/catalog/products.json")
OUTPUT_FIRST_SEEN = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/catalog/first_seen.json")
OUTPUT_SALES_BY_OUTLET = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/catalog/sales_by_outlet.json")
OUTPUT_LAST_UPDATED = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/catalog/last_updated.json")

TIMEOUT = 120
BASE_URL = "https://orangepax.operations.eu.dynamics.com/data"

# Database Configuration
DB_USER = "postgres"
DB_PASS = "panzer123"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "showroom_sales"
CONN_STR = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
WAREHOUSE_NAMES = {"warehouse", "warehouse riyadh"}

DAYS_BACK = 7

CATEGORY_FILE = Path("C:/Users/ALAA-ORANGE/Desktop/orangedata/FACT/category2026.xlsx")
IMAGES_DIR = Path("C:/Users/ALAA-ORANGE/Desktop/catalog/images")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")

# =========================
# IMAGE LOGIC (PHASE 5)
# =========================
def load_available_images():
    if not IMAGES_DIR.exists():
        print(f"WARNING: Image directory not found at {IMAGES_DIR}")
        return set()
    try:
        # Cache lowercased filenames
        return {f.lower() for f in os.listdir(IMAGES_DIR)}
    except Exception as e:
        print(f"Error reading images: {e}")
        return set()

def resolve_image(available_images, code, alias, gofrugal, related_kit_id=None):
    candidates = []
    
    # 1. Gather Raw Candidates
    raw_list = [code, alias, gofrugal]
    if related_kit_id:
        raw_list.append(related_kit_id)
        
    for r in raw_list:
        s = str(r).strip()
        if not s: continue
        
        candidates.append(s)
        
        # Pattern: 22xxxxx -> 2xxxxx (7 digits)
        if len(s) == 7 and s.startswith("22"):
            candidates.append(s[1:])
            
        # Pattern: 4xxxxx -> xxxxx
        if s.startswith("4"):
            candidates.append(s[1:])
            # Pattern: 44xxxxx -> xxxxxx
            if s.startswith("44"):
                candidates.append(s[2:])
                
        # Pattern: KIT-xxxxx -> xxxxx
        if s.upper().startswith("KIT-"):
            candidates.append(s[4:])
            
    # 2. Check Existence
    unique_candidates = list(dict.fromkeys(candidates))
    
    for cand in unique_candidates:
        cand_lower = cand.lower()
        for ext in IMAGE_EXTENSIONS:
            target = f"{cand_lower}{ext}"
            if target in available_images:
                return f"{cand}{ext}"
                
    return ""

# =========================
# CATEGORY LOGIC
# =========================
def load_category_rules():
    path = CATEGORY_FILE
    if not path.exists():
        print(f"WARNING: Category file not found at {path}")
        return []
    
    try:
        df = pd.read_excel(path)
        # Ensure cols exist
        if "Item Starts With" not in df.columns or "Category" not in df.columns:
            print("WARNING: Category file missing required columns")
            return []
            
        df["Item Starts With"] = df["Item Starts With"].astype(str).str.strip()
        df["Category"] = df["Category"].astype(str).str.strip()
        
        rules = list(zip(df["Item Starts With"], df["Category"]))
        # Sort by length desc
        rules.sort(key=lambda x: len(x[0]), reverse=True)
        return rules
    except Exception as e:
        print(f"Error loading categories: {e}")
        return []

def get_category(item_number, rules):
    item_str = str(item_number).strip()
    clean_str = item_str
    
    if clean_str.lower().startswith("kit-"):
        clean_str = clean_str[4:]
        
    for prefix, cat in rules:
        if clean_str.startswith(prefix):
            return cat
            
    return "UNCATEGORIZED"

# =========================
# AUTH
# =========================
def get_access_token():
    load_dotenv()

    client_id = os.getenv("CLIENT_ID")
    client_secret = os.getenv("CLIENT_SECRET")
    tenant_id = os.getenv("TENANT_ID")

    if not all([client_id, client_secret, tenant_id]):
        raise ValueError("Missing CLIENT_ID / CLIENT_SECRET / TENANT_ID")

    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )

    token = app.acquire_token_for_client(
        scopes=["https://orangepax.operations.eu.dynamics.com/.default"]
    )

    if "access_token" not in token:
        raise Exception(token)

    return token["access_token"]

# =========================
# FETCH WITH PAGINATION
# =========================
def fetch_all(token, url, label):
    headers = {"Authorization": f"Bearer {token}"}
    rows, page = [], 0

    print(f"[{label}] Starting fetch...")

    while url:
        page += 1
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()

        rows.extend(data.get("value", []))
        print(f"   [{label}] Page {page} | Rows so far: {len(rows):,}")

        url = data.get("@odata.nextLink")

    return pd.DataFrame(rows)

# =========================
# LOAD MAPPINGS
# =========================
def load_mapping(sheet, cols):
    df = pd.read_excel(MAPPING_FILE, sheet_name=sheet)
    df = df[cols].copy()

    for c in cols:
        df[c] = df[c].astype(str).str.strip()

    return df

# =========================
# MAIN
# =========================
def main():
    token = get_access_token()

    print("Loading mappings...")
    try:
        df_table5 = load_mapping(TABLE5_SHEET, ["store number", "outlet"])
    except Exception as e:
        print(f"WARNING: Could not load store mapping (Sheet1): {e}")
        df_table5 = pd.DataFrame(columns=["store number", "outlet"])

    print("Loading Category Rules...")
    category_rules = load_category_rules()
    
    print("Caching Images (Phase 5)...")
    available_images = load_available_images()

    # =====================
    # ONHAND
    # =====================
    df_onhand_raw = fetch_all(
        token,
        f"{BASE_URL}/WarehousesOnHandV2?$select=ItemNumber,InventoryWarehouseId,ProductName,TotalAvailableQuantity",
        "ONHAND"
    )

    df_onhand_raw["InventoryWarehouseId"] = df_onhand_raw["InventoryWarehouseId"].astype(str).str.strip()
    df_onhand_raw["ItemNumber"] = df_onhand_raw["ItemNumber"].astype(str).str.strip()

    df_onhand = df_onhand_raw.merge(
        df_table5,
        left_on="InventoryWarehouseId",
        right_on="store number",
        how="left"
    )

    df_onhand["Outlet"] = (
        df_onhand["outlet"]
        .fillna(df_onhand["InventoryWarehouseId"])
        .astype(str)
        .str.strip()
    )
    df_onhand["Outlet"] = df_onhand["Outlet"].replace({
        "WH01": "Warehouse",
        "WH02": "warehouse riyadh",
        "wh01": "Warehouse",
        "wh02": "warehouse riyadh"
    })

    # =====================
    # BARCODE
    # =====================
    df_barcode = fetch_all(
        token,
        f"{BASE_URL}/RetailInventItemBarcode?$select=itemId,description",
        "BARCODE"
    ).drop_duplicates("itemId")

    # =====================
    # ITEM MASTER
    # =====================
    df_items_raw = fetch_all(
        token,
        f"{BASE_URL}/ReleasedProductsV2?$select=ItemNumber,SalesPrice,ProductSearchName,SalesPriceDate,OldItem",
        "ITEM_MASTER"
    )

    df_items_raw["SalesPriceDate"] = pd.to_datetime(df_items_raw["SalesPriceDate"], errors="coerce")
    df_items_raw["ItemNumber"] = df_items_raw["ItemNumber"].astype(str).str.strip()
    df_items_raw["OldItem"] = df_items_raw["OldItem"].astype(str).str.strip().replace("nan", "")

    # MAPPING DISABLED PER USER REQUEST
    df_items = (
        df_items_raw
        .sort_values("SalesPriceDate", ascending=False)
        .drop_duplicates("ItemNumber")
        .merge(df_barcode, left_on="ItemNumber", right_on="itemId", how="left")
    )

    # =====================
    # SALES (LOCAL DATABASE FETCH)
    # =====================
    print("Fetching sales from local database...")
    cutoff_date = (datetime.now() - timedelta(days=DAYS_BACK)).date()

    engine = create_engine(CONN_STR)
    query = text("""
        SELECT store_number, item_date, quantity, item_id, transaction_status
        FROM dynamic_sales_items
        WHERE item_date >= :cutoff
    """)

    with engine.connect() as conn:
        df_sales_raw = pd.read_sql(query, conn, params={"cutoff": cutoff_date})

    df_sales_raw = df_sales_raw.rename(columns={
        "store_number": "OperatingUnitNumber",
        "item_date": "TransactionDate",
        "quantity": "UnitQuantity",
        "item_id": "ItemId",
        "transaction_status": "TransactionStatus"
    })

    # =====================
    # SALES FILTER (PANDAS: STATUS)
    # =====================
    df_sales_raw["TransactionDate"] = pd.to_datetime(
        df_sales_raw["TransactionDate"], errors="coerce"
    )

    df_sales_raw["UnitQuantity"] = (
        pd.to_numeric(df_sales_raw["UnitQuantity"], errors="coerce")
        .abs()
    )

    df_sales = df_sales_raw[
        df_sales_raw["TransactionStatus"].isin(["Posted", "None"])
    ].copy()

    df_sales = df_sales.merge(
        df_table5,
        left_on="OperatingUnitNumber",
        right_on="store number",
        how="left"
    )

    df_sales["Outlet"] = (
        df_sales["outlet"]
        .fillna(df_sales["OperatingUnitNumber"])
        .astype(str)
        .str.strip()
    )
    df_sales["Outlet"] = df_sales["Outlet"].replace({
        "WH01": "Warehouse",
        "WH02": "warehouse riyadh",
        "wh01": "Warehouse",
        "wh02": "warehouse riyadh"
    })

    # =====================
    # AGGREGATE SALES
    # =====================
    print("Aggregating sales data...")
    df_sales["ItemId"] = df_sales["ItemId"].astype(str).str.strip()
    df_sales["UnitQuantity"] = df_sales["UnitQuantity"].fillna(0).astype(int)

    grouped_sales = (
        df_sales.groupby(["ItemId", "Outlet"])["UnitQuantity"]
        .sum()
        .reset_index()
    )
    
    sales_by_outlet = {}
    for _, r in grouped_sales.iterrows():
        item = r["ItemId"]
        outlet = r["Outlet"]
        qty = int(r["UnitQuantity"])
        
        if item not in sales_by_outlet:
            sales_by_outlet[item] = {}
        sales_by_outlet[item][outlet] = qty

    # =====================
    # BUILD PRODUCTS
    # =====================
    products = []
    first_seen = {}

    onhand_grouped = df_onhand.groupby("ItemNumber")

    base_to_kit = {}
    for _, r in df_items.iterrows():
        item_num = str(r["ItemNumber"]).strip().upper()
        alias = str(r["OldItem"]).strip()
        if item_num.startswith("KIT"):
            base = item_num[4:] if item_num.startswith("KIT-") else item_num[3:]
            if base:
                base_to_kit[base] = alias if alias != "nan" and alias else item_num

    for _, r in df_items.iterrows():
        item_number = r["ItemNumber"]
        
        # Filter: Exclude barcodes starting with 3 or 29
        if str(item_number).startswith("3") or str(item_number).startswith("29"):
            continue

        name_ar = r["description"] if pd.notna(r["description"]) else ""
        name_en = "" # r["english name"] -- Removed per user request
        name = " - ".join(x for x in [name_ar, name_en] if x) or r.get("ProductSearchName", "")

        gf = "" # r.get("Item code") -- Removed per user request

        branches = {}
        total_stock = 0

        if item_number in onhand_grouped.groups:
            for _, s in onhand_grouped.get_group(item_number).iterrows():
                o = s["Outlet"]
                q = int(s["TotalAvailableQuantity"])
                branches[o] = branches.get(o, 0) + q
                if o.lower() in WAREHOUSE_NAMES:
                    total_stock += q

        total_sales = sum(sales_by_outlet.get(item_number, {}).values())

        products.append({
            "outlet": "Warehouse",
            "category": get_category(item_number, category_rules),
            "code": item_number,
            "gofrugal_code": gf,
            "alias": r["OldItem"] if pd.notna(r["OldItem"]) else "",
            "name": name,
            "price": float(r["SalesPrice"]) if pd.notna(r["SalesPrice"]) else 0.0,
            "stock": total_stock,
            "sales": total_sales,
            "branches": branches,
            "image_path": resolve_image(available_images, item_number, r["OldItem"] if pd.notna(r["OldItem"]) else "", gf, base_to_kit.get(item_number))
        })

        if pd.notna(r["SalesPriceDate"]):
            first_seen[item_number] = str(r["SalesPriceDate"].date())

    # =====================
    # WRITE FILES
    # =====================
    print(f"Writing {len(products)} products...")

    OUTPUT_PRODUCTS.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_FIRST_SEEN.write_text(json.dumps(first_seen, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_SALES_BY_OUTLET.write_text(json.dumps(sales_by_outlet, ensure_ascii=False, indent=2), encoding="utf-8")

    # Write last updated timestamp
    last_updated_time = datetime.now(timezone.utc).isoformat()
    last_updated_data = {"last_updated": last_updated_time}
    OUTPUT_LAST_UPDATED.write_text(json.dumps(last_updated_data, ensure_ascii=False, indent=2), encoding="utf-8")

    print("DONE")

# =========================
if __name__ == "__main__":
    main()
