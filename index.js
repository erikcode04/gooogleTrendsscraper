import { Actor } from 'apify';
import { chromium } from 'playwright';

// Helper function to convert stream to string
async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

// Parse Google Trends CSV data
function parseGoogleTrendsCsv(csvContent) {
    const lines = csvContent.split('\n');
    const result = {
        category: '',
        top: [],
        rising: []
    };

    let currentSection = '';

    for (let line of lines) {
        line = line.trim();

        // Skip empty lines
        if (!line) continue;

        // Category line
        if (line.startsWith('Kategori:')) {
            result.category = line.replace('Kategori:', '').trim();
            continue;
        }

        // Section headers
        if (line === 'TOP') {
            currentSection = 'top';
            continue;
        }

        if (line === 'RISING') {
            currentSection = 'rising';
            continue;
        }

        // Data lines
        if (currentSection && line.includes(',')) {
            const [term, value] = line.split(',');

            if (currentSection === 'top') {
                result.top.push({
                    term: term.trim(),
                    value: parseInt(value.trim())
                });
            } else if (currentSection === 'rising') {
                result.rising.push({
                    term: term.trim(),
                    value: value.trim()
                });
            }
        }
    }

    return result;
}

// Scrape Google Trends CSV
async function scrapeGoogleTrends(page) {
    try {
        console.log('Scraping Google Trends data...');

        // Wait for the page to load completely
        await page.waitForLoadState('networkidle');

        // Wait for the download button to be visible
        await page.waitForSelector('i.material-icons-extended:has-text("file_download")', { timeout: 30000 });

        // Click download and wait for the download to complete
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.click('i.material-icons-extended:has-text("file_download")')
        ]);

        console.log('Download started...');

        // Get the CSV content
        const buffer = await download.createReadStream();
        const csvContent = await streamToString(buffer);

        console.log('CSV downloaded successfully');

        // Parse the CSV
        const parsedData = parseGoogleTrendsCsv(csvContent);

        console.log('CSV parsed successfully');
        console.log('Category:', parsedData.category);
        console.log('Top trends count:', parsedData.top.length);
        console.log('Rising trends count:', parsedData.rising.length);

        return parsedData;

    } catch (error) {
        console.error('Error downloading/parsing CSV:', error);
        return null;
    }
}

// Initialize the Actor
await Actor.init();

try {
    // Get input data from Apify
    const input = await Actor.getInput();

    // Default configuration - you can override these via Actor input
    const config = {
        proxyConfiguration: input?.proxyConfiguration || {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
            apifyProxyCountry: 'US'
        },
        maxConcurrency: input?.maxConcurrency || 1,
        testUrl: input?.testUrl || 'https://httpbin.org/ip'
    };

    // Create proxy configuration
    const proxyConfiguration = await Actor.createProxyConfiguration(config.proxyConfiguration);

    console.log('Starting Apify Actor with residential proxy...');

    // Get proxy info
    let proxyOptions = {};
    if (proxyConfiguration) {
        const proxyInfo = await proxyConfiguration.newProxyInfo();
        proxyOptions = {
            proxy: {
                server: `${proxyInfo.url}`,
                username: proxyInfo.username,
                password: proxyInfo.password
            }
        };
        console.log('Using proxy:', proxyInfo.url);
    }

    // Launch browser with proxy
    const browser = await chromium.launch({
        headless: true,
        ...proxyOptions
    });

    const page = await browser.newPage();

    // Test connection and log status
    console.log('Testing proxy connection...');

    try {
        // Navigate to IP check service to verify proxy
        await page.goto(config.testUrl, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Extract IP information
        const ipInfo = await page.evaluate(() => {
            try {
                const bodyText = document.body.innerText;
                const jsonMatch = bodyText.match(/\{[\s\S]*\}/);
                return jsonMatch ? JSON.parse(jsonMatch[0]) : { ip: 'Unknown' };
            } catch (e) {
                return { ip: document.body.innerText.trim() };
            }
        });

        console.log('✅ Proxy connection successful!');
        console.log('Current IP:', ipInfo.ip);
        console.log('Full response:', ipInfo);

        // Save connection status to Actor output
        await Actor.pushData({
            success: true,
            timestamp: new Date().toISOString(),
            proxyType: 'residential',
            currentIp: ipInfo.ip,
            connectionDetails: ipInfo,
            message: 'Proxy connection established successfully'
        });

    } catch (error) {
        console.error('❌ Proxy connection failed:', error.message);

        // Save error to Actor output
        await Actor.pushData({
            success: false,
            timestamp: new Date().toISOString(),
            proxyType: 'residential',
            error: error.message,
            message: 'Failed to establish proxy connection'
        });
    }

    // Test Google Trends accessibility and scrape data
    try {
        console.log('Testing Google Trends accessibility...');
        await page.goto('https://trends.google.com/trends/explore?geo=SE&hl=sv', {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        const title = await page.title();
        console.log('✅ Google Trends accessible! Page title:', title);

        // Scrape Google Trends CSV data
        const trendsData = await scrapeGoogleTrends(page);

        if (trendsData) {
            // Save the parsed trends data to Actor output
            await Actor.pushData({
                success: true,
                timestamp: new Date().toISOString(),
                test: 'google_trends_scrape',
                pageTitle: title,
                trendsData: trendsData,
                message: 'Google Trends data scraped successfully'
            });

            console.log('✅ Google Trends data scraped and saved successfully!');
        } else {
            await Actor.pushData({
                success: false,
                timestamp: new Date().toISOString(),
                test: 'google_trends_scrape',
                error: 'Failed to scrape trends data',
                message: 'Google Trends scraping failed'
            });
        }

    } catch (error) {
        console.log('⚠️ Google Trends access test failed:', error.message);

        await Actor.pushData({
            success: false,
            timestamp: new Date().toISOString(),
            test: 'google_trends_access',
            error: error.message,
            message: 'Google Trends access failed via proxy'
        });
    }

    await browser.close();
    console.log('Actor completed successfully!');

} catch (error) {
    console.error('Actor failed:', error);

    // Save final error to output
    await Actor.pushData({
        success: false,
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        message: 'Actor execution failed'
    });

    throw error;
} finally {
    // Finalize the Actor
    await Actor.exit();
}