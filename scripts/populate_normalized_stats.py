#!/usr/bin/env python
import os
import sys
import time
import argparse
import re
import yaml
from loguru import logger
import psycopg2
from dotenv import load_dotenv
from pathlib import Path
from ua_parser import user_agent_parser
from tld import get_fld
from tld.exceptions import TldDomainNotFound, TldBadUrl

# Load environment variables
load_dotenv()

# Configure logger
logger.add("logs/populate_normalized_stats.log", rotation="10 MB", retention="1 month")

def load_matomo_bot_patterns():
    """Load bot detection patterns from Matomo's bots.yml file.

    Returns:
        list: List of compiled regex patterns for bot detection
    """
    # Try multiple possible locations for the bots.yml file
    script_dir = Path(__file__).parent
    possible_paths = [
        script_dir.parent / "resources" / "matomo" / "bots.yml",  # ../resources/matomo/bots.yml
        script_dir / "resources" / "matomo" / "bots.yml",  # resources/matomo/bots.yml
        Path("resources") / "matomo" / "bots.yml",  # ./resources/matomo/bots.yml
    ]

    bots_yml_path = None
    for path in possible_paths:
        if path.exists():
            bots_yml_path = path
            break

    if not bots_yml_path:
        logger.error(f"Matomo bots.yml not found! Tried: {[str(p) for p in possible_paths]}")
        logger.warning("Falling back to basic bot detection patterns")
        # Fallback to basic patterns
        return [
            re.compile(r'bot', re.IGNORECASE),
            re.compile(r'crawler', re.IGNORECASE),
            re.compile(r'spider', re.IGNORECASE),
        ]

    try:
        with open(bots_yml_path, 'r', encoding='utf-8') as f:
            bots_data = yaml.safe_load(f)

        # Compile regex patterns from YAML
        bot_patterns = []
        for bot in bots_data:
            if 'regex' in bot:
                try:
                    # Compile each regex pattern (case-insensitive)
                    pattern = re.compile(bot['regex'], re.IGNORECASE)
                    bot_patterns.append(pattern)
                except re.error as e:
                    logger.warning(f"Invalid regex pattern '{bot['regex']}': {e}")
                    continue

        logger.info(f"Loaded {len(bot_patterns)} bot detection patterns from Matomo: {bots_yml_path}")
        return bot_patterns

    except Exception as e:
        logger.error(f"Error loading Matomo bot patterns from {bots_yml_path}: {e}")
        logger.warning("Falling back to basic bot detection patterns")
        return [
            re.compile(r'bot', re.IGNORECASE),
            re.compile(r'crawler', re.IGNORECASE),
            re.compile(r'spider', re.IGNORECASE),
        ]

# Load Matomo bot patterns
BOT_PATTERNS = load_matomo_bot_patterns()

class DatabaseConnection:
    """Database connection manager for Supabase."""
    
    def __init__(self):
        self.conn = None
        self.cur = None
        
    def __enter__(self):
        try:
            # Connect to Supabase PostgreSQL
            logger.info("Connecting to Supabase database...")
            self.conn = psycopg2.connect(
                host=os.getenv('SUPABASE_PSQL_DB_HOST'),
                dbname=os.getenv('SUPABASE_PSQL_DB_NAME'),
                user=os.getenv('SUPABASE_PSQL_DB_USER'),
                password=os.getenv('SUPABASE_PSQL_DB_PASSWORD'),
                port=5432,
                sslmode='require'
            )
            self.cur = self.conn.cursor()
            logger.info("Connected to Supabase database")
            return self
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            if self.conn:
                self.conn.close()
            raise
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            if self.conn:
                self.conn.rollback()
            logger.error(f"Database error: {exc_val}")
        
        if self.cur:
            self.cur.close()
        if self.conn:
            self.conn.close()
    
    def execute(self, query, params=None):
        """Execute a database query with parameters."""
        self.cur.execute(query, params)
        return self.cur
    
    def commit(self):
        """Commit the current transaction."""
        self.conn.commit()
        
    def fetchall(self):
        """Fetch all results from the last query."""
        return self.cur.fetchall()

class UserAgentNormalizer:
    """Class to normalize user agent strings and referrers in the database."""
    
    def __init__(self, batch_size=1000, max_records=None, dry_run=False, 
                 table_name="metrics_page_views", verbose=False, force=False):
        """Initialize the normalizer.
        
        Args:
            batch_size (int): Number of records to process in each batch.
            max_records (int, optional): Maximum number of records to process in total.
            dry_run (bool): If True, don't actually update the database.
            table_name (str): Name of the table to update.
            verbose (bool): If True, print verbose output.
            force (bool): If True, update all records regardless of current values.
        """
        self.batch_size = batch_size
        self.max_records = max_records
        self.dry_run = dry_run
        self.table_name = table_name
        self.verbose = verbose
        self.force = force
        
        if verbose:
            logger.info(f"Configuration: batch_size={batch_size}, max_records={max_records}, "
                       f"dry_run={dry_run}, force={force}, table={table_name}")
            logger.info(f"Bot detection patterns: {len(BOT_PATTERNS)} Matomo regex patterns loaded")
    
    def is_bot_user_agent(self, user_agent_string):
        """Check if a user agent string belongs to a bot using Matomo's patterns.

        Args:
            user_agent_string (str): Raw user agent string

        Returns:
            bool: True if the user agent appears to be a bot
        """
        if not user_agent_string:
            return False

        # Check against Matomo bot patterns (regex matching)
        for pattern in BOT_PATTERNS:
            if pattern.search(user_agent_string):
                if self.verbose:
                    logger.info(f"Bot detected by pattern '{pattern.pattern}' in UA: {user_agent_string[:100]}")
                return True

        return False
    
    def normalize_user_agent(self, user_agent_string):
        """Normalize a user agent string into browser, OS, and device components.
        
        Args:
            user_agent_string (str): Raw user agent string
            
        Returns:
            tuple: (browser, os, device) normalized strings
        """
        if not user_agent_string:
            return None, None, None
            
        # First check if this is a bot
        if self.is_bot_user_agent(user_agent_string):
            return "Bot", "Bot", "Bot"
            
        try:
            # Parse the user agent string
            parsed_ua = user_agent_parser.Parse(user_agent_string)
            
            # Extract components
            browser_family = parsed_ua['user_agent']['family']
            os_family = parsed_ua['os']['family']
            device_family = parsed_ua['device']['family']
            
            # Normalize browser
            browser = None  # Default to NULL for unrecognized browsers
            
            # Check if browser was identified by parser
            if browser_family and browser_family != 'Other':
                # iOS webview detection first (to avoid misclassification)
                if ('iPhone' in user_agent_string or 'iPad' in user_agent_string) and 'Safari' in browser_family:
                    if 'webview' in user_agent_string.lower() or 'wv' in user_agent_string.lower():
                        browser = 'iOS (webview)'
                    else:
                        browser = 'iOS'
                # Chrome variants
                elif 'Chrome' in browser_family:
                    if 'iOS' in os_family:
                        browser = 'Chrome (iOS)'
                    elif 'webview' in user_agent_string.lower() or 'wv' in user_agent_string.lower():
                        browser = 'Chrome (webview)'
                    else:
                        browser = 'Chrome'
                # Edge variants
                elif 'Edge' in browser_family:
                    if 'iOS' in os_family:
                        browser = 'Edge (iOS)'
                    elif 'Chromium' in user_agent_string:
                        browser = 'Edge (Chromium)'
                    else:
                        browser = 'Edge'
                # Standard browsers
                elif 'Firefox' in browser_family:
                    browser = 'Firefox'
                elif 'Safari' in browser_family:
                    browser = 'Safari'
                elif 'Opera' in browser_family:
                    browser = 'Opera'
                # Social and specialized browsers
                elif 'Instagram' in browser_family or 'Instagram' in user_agent_string:
                    browser = 'Instagram'
                elif 'Facebook' in browser_family or 'FBAV' in user_agent_string:
                    browser = 'Facebook'
                elif 'Samsung' in browser_family:
                    browser = 'Samsung'
                elif 'YaBrowser' in browser_family or 'Yandex' in browser_family:
                    browser = 'Yandex'
            
            # If browser is still None, try to infer from the user agent string
            if browser is None:
                ua_lower = user_agent_string.lower()
                
                # Look for browser signatures in the user agent string
                if 'firefox' in ua_lower:
                    browser = 'Firefox'
                elif 'chrome' in ua_lower:
                    browser = 'Chrome'
                elif 'safari' in ua_lower:
                    browser = 'Safari'
                elif 'edge' in ua_lower:
                    browser = 'Edge'
                elif 'opera' in ua_lower:
                    browser = 'Opera'
                elif 'instagram' in ua_lower:
                    browser = 'Instagram'
                elif 'facebook' in ua_lower or 'fbav' in ua_lower:
                    browser = 'Facebook'
                elif 'samsung' in ua_lower:
                    browser = 'Samsung'
                elif 'yandex' in ua_lower or 'yabrowser' in ua_lower:
                    browser = 'Yandex'
                # If we have a valid Mozilla user agent but no browser identified, return None
                # This keeps it consistent with other unrecognized browsers
                elif ua_lower.startswith('mozilla/5.0') and ('windows' in ua_lower or 'linux' in ua_lower or 'macintosh' in ua_lower or 'android' in ua_lower):
                    browser = None  # Valid browser but unrecognized type - keep as NULL
            
            # Normalize OS
            os = None  # Default to NULL for unrecognized OS
            if os_family:
                if self.verbose:
                    logger.info(f"Raw OS family from parser: {os_family} for UA: {user_agent_string[:100]}")
                
                # Normalize OS with more inclusive matching
                os_family_lower = os_family.lower()
                
                # Windows detection (including Server versions)
                if 'windows' in os_family_lower:
                    ua_lower = user_agent_string.lower()
                    
                    # First check the raw UA string as it's often more reliable
                    if 'windows nt 10.0' in ua_lower or 'windows 11' in ua_lower or 'windows nt 11.0' in ua_lower:
                        os = 'Windows 10/11'
                    elif 'windows nt 6.1' in ua_lower or 'windows 7' in ua_lower:
                        os = 'Windows 7'
                    elif 'windows nt 6.3' in ua_lower or 'windows 8.1' in ua_lower:
                        os = 'Windows 8.1'
                    elif 'windows nt 6.2' in ua_lower or 'windows 8' in ua_lower:
                        os = 'Windows 8'
                    elif 'windows nt 6.0' in ua_lower or 'windows vista' in ua_lower:
                        os = 'Windows Vista'
                    elif 'windows nt 5.1' in ua_lower or 'windows xp' in ua_lower:
                        os = 'Windows XP'
                    else:
                        # Fall back to version parsing from ua-parser
                        version = parsed_ua['os'].get('version', '')
                        if version:
                            try:
                                major = version.split('.')[0] if '.' in version else version
                                minor = version.split('.')[1] if '.' in version else ''
                                
                                if self.verbose:
                                    logger.info(f"Windows version parsing - Major: {major}, Minor: {minor}")
                                
                                if major == '10' or major == '11':
                                    os = 'Windows 10/11'
                                elif major == '6':
                                    if minor == '1':
                                        os = 'Windows 7'
                                    elif minor == '3':
                                        os = 'Windows 8.1'
                                    elif minor == '2':
                                        os = 'Windows 8'
                                    elif minor == '0':
                                        os = 'Windows Vista'
                                    else:
                                        os = 'Windows 10/11'  # Default newer Windows versions to 10/11
                                elif major == '5' and minor == '1':
                                    os = 'Windows XP'
                                else:
                                    os = 'Windows 10/11'  # Default newer Windows versions to 10/11
                            except Exception as e:
                                if self.verbose:
                                    logger.warning(f"Error parsing Windows version: {e}")
                                os = 'Windows 10/11'  # Default to Windows 10/11 on parsing error
                        else:
                            # No version info available, check raw UA string again for NT version
                            if 'nt 10.0' in ua_lower or 'nt 11.0' in ua_lower:
                                os = 'Windows 10/11'
                            else:
                                os = 'Windows 10/11'  # Default to Windows 10/11 when no version info
                    
                    if self.verbose:
                        logger.info(f"Windows detection result: {os} from UA: {user_agent_string[:200]}")
                
                # macOS detection (various naming conventions)
                elif any(mac in os_family_lower for mac in ['mac os x', 'macos', 'mac os']):
                    os = 'macOS'
                
                # iOS detection (including iPadOS)
                elif any(ios in os_family_lower for ios in ['ios', 'ipados']):
                    os = 'iOS'
                
                # Android detection
                elif 'android' in os_family_lower:
                    os = 'Android'
                
                # Chrome OS detection
                elif any(chrome in os_family_lower for chrome in ['chrome os', 'chromeos', 'chromium os']):
                    os = 'ChromeOS'
                
                # Linux detection (including distributions)
                elif any(linux in os_family_lower for linux in ['linux', 'ubuntu', 'debian', 'fedora', 'red hat', 'centos', 'suse']):
                    os = 'Linux'
            
            # If OS is still None, try to infer from the user agent string
            if os is None:
                ua_lower = user_agent_string.lower()
                
                # Look for OS signatures in the user agent string
                if 'windows nt 10.0' in ua_lower or 'windows 11' in ua_lower:
                    os = 'Windows 10/11'
                elif 'windows nt 6.1' in ua_lower:
                    os = 'Windows 7'
                elif 'windows nt 6.3' in ua_lower:
                    os = 'Windows 8.1'
                elif 'windows nt 6.2' in ua_lower:
                    os = 'Windows 8'
                elif 'windows nt 6.0' in ua_lower:
                    os = 'Windows Vista'
                elif 'windows nt 5.1' in ua_lower:
                    os = 'Windows XP'
                elif 'windows' in ua_lower:
                    os = 'Windows 10/11'  # Default for Windows
                elif 'macintosh' in ua_lower or 'mac os' in ua_lower:
                    os = 'macOS'
                elif 'android' in ua_lower:
                    os = 'Android'
                elif 'linux' in ua_lower:
                    os = 'Linux'
                elif 'x11' in ua_lower:
                    os = 'Linux'  # X11 typically indicates Linux
            
            # Normalize device type
            device = None  # Default to NULL for unrecognized devices
            
            # Convert to lowercase for case-insensitive matching
            ua_lower = user_agent_string.lower()
            device_family_lower = device_family.lower() if device_family else ""
            os_family_lower = os_family.lower() if os_family else ""
            
            # Mobile detection
            mobile_indicators = [
                'mobile', 'phone', 'iphone', 'android', 'smartphone',
                'blackberry', 'webos', 'windows phone', 'opera mini',
                'opera mobi', 'samsung-', 'nokia', 'motorola',
                'mobile safari', 'fennec', 'iemobile', 'bolt',
                'iris', 'maemo', 'midp', 'netfront', 'ucweb'
            ]
            
            # Tablet detection
            tablet_indicators = [
                'tablet', 'ipad', 'kindle', 'surface', 'playbook',
                'nexus 7', 'nexus 9', 'nexus 10', 'galaxy tab',
                'touch', 'touchscreen', 'wacom', 'transformer',
                'tab s', 'tab a', 'tab e', 'mediapad'
            ]
            
            # Desktop detection
            desktop_indicators = [
                'desktop', 'windows nt', 'macintosh', 'x11',
                'linux x86', 'ubuntu', 'fedora', 'debian',
                'electron', 'chromium', 'firefox/', 'gecko/',
                'macappstore', 'win64', 'win32', 'x86_64'
            ]
            
            # First check device family from parser
            if device_family_lower in ['smartphone', 'mobile', 'phone'] or 'phone' in device_family_lower:
                device = 'Mobile'
            elif 'tablet' in device_family_lower:
                device = 'Tablet'
            elif device_family_lower in ['desktop', 'pc', 'computer']:
                device = 'Desktop'
            else:
                # Then check user agent string
                if any(indicator in ua_lower for indicator in tablet_indicators):
                    device = 'Tablet'
                elif any(indicator in ua_lower for indicator in mobile_indicators) and not any(indicator in ua_lower for indicator in tablet_indicators):
                    device = 'Mobile'
                elif any(indicator in ua_lower for indicator in desktop_indicators):
                    device = 'Desktop'
                # Special case for iOS devices
                elif 'ios' in os_family_lower:
                    if 'ipad' in ua_lower:
                        device = 'Tablet'
                    elif 'iphone' in ua_lower or 'ipod' in ua_lower:
                        device = 'Mobile'
                # Special case for Android
                elif 'android' in os_family_lower:
                    # Check for common Android tablet screen sizes
                    if any(x in ua_lower for x in ['tablet', 'tab', 'pad']) or (
                        'android' in ua_lower and not any(x in ua_lower for x in ['mobile', 'phone'])):
                        device = 'Tablet'
                    else:
                        device = 'Mobile'  # Most Android devices are mobile if not explicitly tablet
                # Default desktop for Windows/Mac/Linux when no mobile/tablet indicators
                elif any(os in os_family_lower for os in ['windows', 'mac', 'linux', 'ubuntu', 'fedora', 'debian']):
                    device = 'Desktop'
            
            if self.verbose and device is None:
                logger.info(f"Could not determine device type for UA: {user_agent_string[:100]}")
            
            return browser, os, device
            
        except Exception as e:
            logger.error(f"Error normalizing user agent '{user_agent_string}': {e}")
            return None, None, None
    
    def normalize_referrer(self, referrer):
        """Normalize a referrer URL to its main domain.
        
        Args:
            referrer (str): Raw referrer URL
            
        Returns:
            str: Normalized domain or None if invalid/internal
        """
        if not referrer:
            return None
            
        try:
            # Extract the domain using tld library
            domain = get_fld(referrer, fail_silently=True)
            
            if domain:
                # Convert to lowercase for consistency
                domain = domain.lower()
                
                # Skip internal referrers (customize this list as needed)
                internal_domains = {'localhost', '127.0.0.1', 'dropcatch.com'}
                if domain in internal_domains:
                    return None
                    
                return domain
                
        except (TldDomainNotFound, TldBadUrl) as e:
            if self.verbose:
                logger.warning(f"Could not extract domain from referrer '{referrer}': {e}")
        except Exception as e:
            if self.verbose:
                logger.error(f"Error processing referrer '{referrer}': {e}")
                
        return None

    def normalize_domain(self, domain):
        """Normalize a domain string to its main domain.
        
        Args:
            domain (str): Raw domain string
            
        Returns:
            str: Normalized domain or the original domain if normalization fails
        """
        if not domain:
            return None
        
        # Clean up the domain - trim whitespace and remove any protocol prefixes
        domain = domain.strip().lower()
        for prefix in ['http://', 'https://', 'ftp://']:
            if domain.startswith(prefix):
                domain = domain[len(prefix):]
        
        # Remove any path components or query strings
        domain = domain.split('/')[0].split('?')[0].split('#')[0]
        
        # Check if it's an IP address
        ip_pattern = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
        if ip_pattern.match(domain):
            return domain
        
        try:
            # Extract the domain using tld library
            normalized_domain = get_fld('http://' + domain, fail_silently=True)
            
            if normalized_domain:
                return normalized_domain.lower()
            else:
                # If TLD extraction fails, return the original domain
                # This ensures we at least have something rather than NULL
                return domain
            
        except (TldDomainNotFound, TldBadUrl) as e:
            if self.verbose:
                logger.warning(f"Could not extract normalized domain from '{domain}': {e}")
            # Return the original domain rather than NULL
            return domain
        except Exception as e:
            if self.verbose:
                logger.error(f"Error processing domain '{domain}': {e}")
            # Return the original domain rather than NULL
            return domain

    def get_records_to_update(self, db, limit=None, force=False):
        """Get records that need normalization.
        
        Args:
            db (DatabaseConnection): Database connection
            limit (int, optional): Maximum number of records to retrieve
            force (bool): If True, update all records regardless of current values
            
        Returns:
            list: List of records to update
        """
        if force:
            # When forcing, select all records that have either user_agent or domain data
            query = f"""
                SELECT id, user_agent, referrer, domain 
                FROM {self.table_name}
                WHERE (user_agent IS NOT NULL OR domain IS NOT NULL)
            """
        else:
            # When not forcing, only select records that need normalization
            query = f"""
                SELECT id, user_agent, referrer, domain 
                FROM {self.table_name}
                WHERE (
                    (user_agent IS NOT NULL AND (
                        browser_normalized IS NULL OR
                        os_normalized IS NULL OR
                        device_normalized IS NULL
                    )) OR
                    (referrer IS NOT NULL AND referrer_normalized IS NULL) OR
                    (domain IS NOT NULL AND domain_normalized IS NULL)
                )
            """

        query += " ORDER BY id"
        
        if limit:
            query += f" LIMIT {limit}"
        
        if self.verbose:
            logger.info(f"Executing query: {query}")
            
        db.execute(query)
        return db.fetchall()
    
    def update_record(self, db, record_id, browser, os, device, referrer_normalized, domain_normalized):
        """Update normalized values for a record.
        
        Args:
            db (DatabaseConnection): Database connection
            record_id (int): Record ID to update
            browser (str): Normalized browser name
            os (str): Normalized operating system name
            device (str): Normalized device type
            referrer_normalized (str): Normalized referrer domain
            domain_normalized (str): Normalized domain
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Determine which fields to update based on what data we have
            fields_to_update = []
            values = []
            
            # Only include fields in the update if we have data for them
            if browser is not None:
                fields_to_update.append("browser_normalized = %s")
                values.append(browser)
            
            if os is not None:
                fields_to_update.append("os_normalized = %s")
                values.append(os)
            
            if device is not None:
                fields_to_update.append("device_normalized = %s")
                values.append(device)
            
            if referrer_normalized is not None:
                fields_to_update.append("referrer_normalized = %s")
                values.append(referrer_normalized)
            
            if domain_normalized is not None:
                fields_to_update.append("domain_normalized = %s")
                values.append(domain_normalized)
            
            # If no fields to update, return early
            if not fields_to_update:
                return True
            
            # Construct the update query
            set_clause = ", ".join(fields_to_update)
            query = f"""
                UPDATE {self.table_name}
                SET {set_clause}
                WHERE id = %s
            """
            
            # Add the record ID as the last parameter
            values.append(record_id)
            
            if self.dry_run:
                if self.verbose:
                    logger.info(f"DRY RUN: Would execute: {query} with params {values}")
                return True
            
            db.execute(query, values)
            return True
        except Exception as e:
            logger.error(f"Error updating record {record_id}: {e}")
            return False
    
    def process_records(self):
        """Process records with missing normalized values."""
        processed_count = 0
        updated_count = 0
        unknown_count = 0
        domain_only_count = 0
        start_time = time.time()
        
        with DatabaseConnection() as db:
            # First, ensure the required columns exists
            try:
                if not self.dry_run:
                    db.execute(f"""
                        ALTER TABLE {self.table_name}
                        ADD COLUMN IF NOT EXISTS referrer_normalized TEXT;
                    """)
                    db.execute(f"""
                        ALTER TABLE {self.table_name}
                        ADD COLUMN IF NOT EXISTS domain_normalized TEXT;
                    """)
                    db.commit()
            except Exception as e:
                logger.error(f"Error adding columns: {e}")
                return False
            
            records_to_update = self.get_records_to_update(db, self.max_records, self.force)
            total_records = len(records_to_update)
            
            if total_records == 0:
                if self.force:
                    logger.info("No records found to process.")
                else:
                    logger.info("No records found that need normalization.")
                return True
                
            logger.info(f"Found {total_records} records to process")
            
            # Process records in batches
            for i in range(0, total_records, self.batch_size):
                batch = records_to_update[i:i+self.batch_size]
                batch_start_time = time.time()
                batch_updated = 0
                batch_unknown = 0
                batch_domain_only = 0
                
                for record in batch:
                    record_id, user_agent, referrer = record[0], record[1], record[2]
                    domain = record[3] if len(record) > 3 else None
                    
                    # Process user agent data if available
                    if user_agent:
                        browser, os, device = self.normalize_user_agent(user_agent)
                        if browser is None and os is None and device is None:
                            batch_unknown += 1
                    else:
                        browser, os, device = None, None, None
                        
                    # Process referrer if available
                    referrer_domain = self.normalize_referrer(referrer) if referrer else None
                    
                    # Process domain if available - this is critical for domain normalization
                    domain_normalized = self.normalize_domain(domain) if domain else None
                    
                    # Update the record with whatever data we have
                    if self.update_record(db, record_id, browser, os, device, referrer_domain, domain_normalized):
                        batch_updated += 1
                        if domain and not user_agent:
                            batch_domain_only += 1
                            
                    processed_count += 1
                
                # Commit after each batch unless in dry run mode
                if not self.dry_run:
                    db.commit()
                    
                updated_count += batch_updated
                unknown_count += batch_unknown
                domain_only_count += batch_domain_only
                
                batch_time = time.time() - batch_start_time
                
                logger.info(
                    f"Processed batch {i//self.batch_size + 1}/{(total_records + self.batch_size - 1)//self.batch_size}: "
                    f"{len(batch)} records ({batch_updated} updated, {batch_unknown} unknown, {batch_domain_only} domain-only) "
                    f"in {batch_time:.2f}s"
                )
                
                # Calculate progress and estimated time remaining
                progress = processed_count / total_records
                elapsed = time.time() - start_time
                estimated_total = elapsed / progress if progress > 0 else 0
                remaining = max(0, estimated_total - elapsed)
                
                logger.info(f"Progress: {progress:.1%}, Estimated time remaining: {remaining/60:.1f} minutes")
        
        total_time = time.time() - start_time
        logger.info(
            f"Completed normalization: processed {processed_count} records, "
            f"updated {updated_count} records ({unknown_count} unknown, {domain_only_count} domain-only) "
            f"in {total_time:.2f}s"
        )
        return True

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Normalize user agent strings in the database.',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    parser.add_argument('--batch-size', type=int, default=1000,
                       help='Number of records to process in each batch')
    parser.add_argument('--max-records', type=int,
                       help='Maximum number of records to process')
    parser.add_argument('--dry-run', action='store_true',
                       help='Don\'t actually update the database')
    parser.add_argument('--force', action='store_true',
                       help='Process all records, even those already normalized')
    parser.add_argument('--table', default='metrics_page_views',
                       help='Name of the table to update')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Print verbose output')
    
    return parser.parse_args()

def main():
    """Main function to run the user agent normalizer."""
    try:
        args = parse_args()
        
        normalizer = UserAgentNormalizer(
            batch_size=args.batch_size,
            max_records=args.max_records,
            dry_run=args.dry_run,
            table_name=args.table,
            verbose=args.verbose,
            force=args.force
        )
        
        if args.dry_run:
            logger.info("DRY RUN: No database changes will be made")
            
        success = normalizer.process_records()
        return 0 if success else 1
        
    except KeyboardInterrupt:
        logger.warning("Process interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Error running user agent normalizer: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 