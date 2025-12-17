/**
 * Sample Generated Appium Test: Login Flow
 * 
 * Prerequisites:
 * 1. npm install webdriverio @wdio/mocha-framework
 * 2. Appium server running on localhost:4723
 * 3. Android emulator running with app installed
 * 
 * Run: npx wdio run wdio.conf.js
 */

const { remote } = require('webdriverio');

describe('Login Flow', () => {
  let driver;

  before(async () => {
    driver = await remote({
      hostname: 'localhost',
      port: 4723,
      path: '/wd/hub',
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': process.env.DEVICE_NAME || 'emulator-5554',
        'appium:app': process.env.APP_PATH || '/path/to/app.apk',
        'appium:appPackage': 'com.example.app',
        'appium:appActivity': 'com.example.app.MainActivity',
        'appium:noReset': true
      }
    });
  });

  after(async () => {
    if (driver) {
      await driver.deleteSession();
    }
  });

  it('should login with valid credentials', async () => {
    // Step 1: Tap email input field
    const emailField = await driver.$('//android.widget.EditText[@resource-id="com.example.app:id/email"]');
    await emailField.click();

    // Step 2: Enter email address
    await emailField.setValue('test@example.com');

    // Step 3: Tap password input field
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="com.example.app:id/password"]');
    await passwordField.click();

    // Step 4: Enter password
    await passwordField.setValue('password123');

    // Step 5: Tap login button
    const loginButton = await driver.$('//android.widget.Button[@text="Login"]');
    await loginButton.click();

    // Step 6: Wait for authentication
    await driver.pause(2000);

    // Step 7: Verify successful login
    const welcomeText = await driver.$('//android.widget.TextView[@text="Welcome"]');
    await expect(welcomeText).toBeDisplayed();
  });

  it('should show error for invalid credentials', async () => {
    // Navigate back to login if needed
    // ...

    const emailField = await driver.$('//android.widget.EditText[@resource-id="com.example.app:id/email"]');
    await emailField.setValue('invalid@example.com');

    const passwordField = await driver.$('//android.widget.EditText[@resource-id="com.example.app:id/password"]');
    await passwordField.setValue('wrongpassword');

    const loginButton = await driver.$('//android.widget.Button[@text="Login"]');
    await loginButton.click();

    await driver.pause(2000);

    // Verify error message
    const errorText = await driver.$('//*[contains(@text, "Invalid") or contains(@text, "Error")]');
    await expect(errorText).toBeDisplayed();
  });
});
