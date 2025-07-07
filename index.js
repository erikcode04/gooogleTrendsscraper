import { Actor } from 'apify';
import puppeteer from 'puppeteer';

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

    // Launch browser with proxy
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();

    // Apply proxy to the page
    if (proxyConfiguration) {
        const proxyUrl = await proxyConfiguration.newUrl();
        console.log('Using proxy:', proxyUrl);

        // Configure proxy for the page
        await page.authenticate({
            username: proxyUrl.username,
            password: proxyUrl.password
        });

        await page.setRequestInterception(true);
        page.on('request', request => {
            request.continue({
                proxy: `${proxyUrl.protocol}//${proxyUrl.host}:${proxyUrl.port}`
            });
        });
    }

    // Test connection and log status
    console.log('Testing proxy connection...');

    try {
        // Navigate to IP check service to verify proxy
        await page.goto(config.testUrl, {
            waitUntil: 'networkidle2',
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

    // Test TikTok accessibility (optional)
    try {
        console.log('Testing TikTok accessibility...');
        await page.goto('https://www.tiktok.com', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        const title = await page.title();
        console.log('✅ TikTok accessible! Page title:', title);

        await Actor.pushData({
            success: true,
            timestamp: new Date().toISOString(),
            test: 'tiktok_access',
            pageTitle: title,
            message: 'TikTok is accessible via proxy'
        });

    } catch (error) {
        console.log('⚠️ TikTok access test failed:', error.message);

        await Actor.pushData({
            success: false,
            timestamp: new Date().toISOString(),
            test: 'tiktok_access',
            error: error.message,
            message: 'TikTok access failed via proxy'
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