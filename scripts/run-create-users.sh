#!/bin/bash

# Script to create users from CSV with Supabase credentials
# Usage: ./scripts/run-create-users.sh

echo "=========================================="
echo "Create Users from CSV"
echo "=========================================="
echo ""
echo "This script will create users from the CSV file:"
echo "/Users/nihal/Downloads/LoHub email - Sheet1.csv"
echo ""
echo "All users will be created with temporary password: TempPassword123!"
echo ""

# Check if credentials are provided as arguments
if [ "$#" -ge 2 ]; then
    export NEXT_PUBLIC_SUPABASE_URL="$1"
    export SUPABASE_SERVICE_ROLE_KEY="$2"
    echo "Using provided credentials..."
    npx tsx scripts/create-users-from-csv.ts "/Users/nihal/Downloads/LoHub email - Sheet1.csv"
elif [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "Using environment variables..."
    npx tsx scripts/create-users-from-csv.ts "/Users/nihal/Downloads/LoHub email - Sheet1.csv"
else
    echo "Please provide Supabase credentials:"
    echo ""
    echo "Option 1: Set environment variables and run:"
    echo "  export NEXT_PUBLIC_SUPABASE_URL=\"your-url\""
    echo "  export SUPABASE_SERVICE_ROLE_KEY=\"your-key\""
    echo "  npx tsx scripts/create-users-from-csv.ts \"/Users/nihal/Downloads/LoHub email - Sheet1.csv\""
    echo ""
    echo "Option 2: Pass as arguments:"
    echo "  npx tsx scripts/create-users-from-csv.ts \"/Users/nihal/Downloads/LoHub email - Sheet1.csv\" \"supabase-url\" \"service-role-key\""
    echo ""
    echo "Option 3: Run interactively (will prompt for credentials):"
    echo "  npx tsx scripts/create-users-from-csv.ts \"/Users/nihal/Downloads/LoHub email - Sheet1.csv\""
    echo ""
    echo "The script will prompt you for credentials if they're not set."
    npx tsx scripts/create-users-from-csv.ts "/Users/nihal/Downloads/LoHub email - Sheet1.csv"
fi
