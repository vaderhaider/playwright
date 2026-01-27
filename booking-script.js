const { chromium } = require('playwright');

// Default configuration (can be overridden by incoming webhook payload)
const DEFAULT_BOOKING_CONFIG = {
  url: 'https://plugin.mysalononline.com/External/BookingPlugin/?sid=0&guid=2916c169-4ac8-4384-8161-c996c086627b',
  
  // Booking details
  date: '03/02/2026', // Format: DD/MM/YYYY
  timePreference: 'Any time', // Options: 'Any time', 'Morning (before noon)', 'Afternoon (noon - 5pm)', 'Evening (after 5pm)'
  service: 'Curly Cut', // Exact service name from dropdown
  employee: 'First Available', // Or specific employee name
  
  // After showing times, which slot to pick (0 = first available)
  timeSlotIndex: 0,
  
  // Customer information (filled on next page after selecting time)
  customerInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '5551234567',
    notes: 'First time visit'
  },
  
  // Browser settings
  headless: false,
  slowMo: 300
};

async function bookAppointment(configOverrides = {}) {
  const BOOKING_CONFIG = { ...DEFAULT_BOOKING_CONFIG, ...configOverrides };

  console.log('🎯 Starting DaySmart Salon booking automation...');
  console.log('📋 Booking request details:', {
    date: BOOKING_CONFIG.date,
    timePreference: BOOKING_CONFIG.timePreference,
    service: BOOKING_CONFIG.service,
    employee: BOOKING_CONFIG.employee,
    timeSlotIndex: BOOKING_CONFIG.timeSlotIndex,
    customerInfo: BOOKING_CONFIG.customerInfo,
    headless: BOOKING_CONFIG.headless,
    slowMo: BOOKING_CONFIG.slowMo
  });
  
  const browser = await chromium.launch({
    headless: BOOKING_CONFIG.headless,
    slowMo: BOOKING_CONFIG.slowMo
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to booking page
    console.log('📍 Step 1/6: Loading booking form...');
    await page.goto(BOOKING_CONFIG.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Fill the date field
    console.log('📅 Step 2/6: Setting date...');
    await fillDateField(page, BOOKING_CONFIG.date);
    
    // Select time preference
    console.log('⏰ Step 3/6: Selecting time preference...');
    await selectTimePreference(page, BOOKING_CONFIG.timePreference);
    
    // Select service from dropdown
    console.log('💇 Step 4/6: Selecting service...');
    await selectFromDropdown(page, 'Service', BOOKING_CONFIG.service);
    
    // Select employee
    console.log('👤 Step 5/6: Selecting employee...');
    await selectFromDropdown(page, 'Employee', BOOKING_CONFIG.employee);
    
    // Click "Show Available Times" button
    console.log('🔍 Step 6/6: Finding available times...');
    // Use the <a> element with the correct class and text
    const showTimesBtn = page.locator('a.button.booking-event:visible', { hasText: 'Show Available Times' }).first();
    if (await showTimesBtn.count() > 0) {
      await showTimesBtn.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('  ⚠️  Show Available Times button not found');
    }
    
    // Select a time slot
    console.log('🕐 Selecting time slot...');
    await selectTimeSlot(page, BOOKING_CONFIG.timeSlotIndex);
    
    await page.waitForTimeout(2000);

    // Fill customer information
    console.log('📝 Filling customer information...');
    await fillCustomerInfo(page, BOOKING_CONFIG.customerInfo);
    
    // Submit the booking
    console.log('✅ Submitting booking...');
    await submitBooking(page);
    
    await page.waitForTimeout(3000);

    console.log('🎉 Booking completed! Confirmation page should now be visible.');
    
    // Keep browser open for verification
    console.log('⏸️  Browser will stay open for 20 seconds...');
    await page.waitForTimeout(20000);
    
  } catch (error) {
    console.error('❌ Error during booking:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function fillDateField(page, dateValue) {
  // Find the date input field
  const dateInput = page.locator('input[placeholder*="Date"], input[type="text"]').first();
  
  // Clear and fill the date field
  await dateInput.clear();
  await dateInput.fill(dateValue);
  await page.waitForTimeout(500);
  
  // Press Escape to close calendar if it opened, or Tab to move to next field
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  
  // Alternatively press Tab to move focus away
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  
  console.log(`  ✓ Date set to: ${dateValue}`);
}

async function selectTimePreference(page, timePreference) {
  // This form uses Kendo UI dropdowns - try keyboard navigation approach
  await page.waitForTimeout(500);
  
  // Find only VISIBLE Kendo dropdown triggers
  const allDropdowns = await page.locator('span.k-dropdown-wrap, span.k-picker-wrap').all();
  const visibleDropdowns = [];
  
  for (const dropdown of allDropdowns) {
    if (await dropdown.isVisible()) {
      visibleDropdowns.push(dropdown);
    }
  }
  
  console.log(`  🔍 Found ${visibleDropdowns.length} VISIBLE Kendo dropdowns (${allDropdowns.length} total)`);
  
  // Index 1 should be Time (0=Date, 1=Time)
  if (visibleDropdowns.length >= 2) {
    console.log('  🖱️  Focusing on Time dropdown...');
    
    // Focus on the dropdown
    await visibleDropdowns[1].click();
    await page.waitForTimeout(500);
    
    // Map time preferences to key presses
    const timeOptions = {
      'Any time': 0,
      'Morning (before noon)': 1,
      'Afternoon (noon - 5pm)': 2,
      'Evening (after 5pm)': 3
    };
    
    const optionIndex = timeOptions[timePreference] ?? 0;
    
    console.log(`  ⌨️  Using keyboard to select option ${optionIndex}...`);
    
    // Open dropdown with Alt+Down or just Down arrow
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    
    // Navigate to the desired option
    for (let i = 0; i < optionIndex; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    
    // Select with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    console.log(`  ✓ Time preference set using keyboard navigation`);
    return;
  }
  
  console.log('  ⚠️  Could not find Kendo time preference dropdown');
}

async function selectFromDropdown(page, labelText, optionText) {
  await page.waitForTimeout(1000);
  if (labelText === 'Service') {
    // Use the actual input for the service autocomplete
    const serviceInput = page.locator('input.ui-combobox-input.ui-autocomplete-input[placeholder="Select Service"]').first();
    if (await serviceInput.count() > 0) {
      console.log('  🖱️  Focusing service input...');
      await serviceInput.click();
      await page.waitForTimeout(500);
      console.log(`  ⌨️  Typing "${optionText}"...`);
      await serviceInput.fill('');
      await serviceInput.type(optionText, { delay: 150 });
      await page.waitForTimeout(1000);
      // Wait for the dropdown menu to appear and select the exact matching option
      const dropdownOptions = await page.locator('.ui-menu-item:visible').all();
      let foundExact = false;
      for (const option of dropdownOptions) {
        const text = (await option.textContent())?.trim().toLowerCase();
        if (text === optionText.trim().toLowerCase()) {
          console.log('  🖱️  Clicking exact matching dropdown option...');
          await option.click();
          await page.waitForTimeout(500);
          console.log('  ✓ Service selected by exact match');
          foundExact = true;
          break;
        }
      }
      if (!foundExact) {
        if (dropdownOptions.length > 0) {
          console.log('  ⚠️  Exact match not found, clicking first dropdown option as fallback...');
          await dropdownOptions[0].click();
          await page.waitForTimeout(500);
          console.log('  ✓ Service selected by clicking first option (fallback)');
        } else {
          // Fallback: press Enter if no dropdown option found
          await serviceInput.press('Enter');
          await page.waitForTimeout(500);
          console.log('  ✓ Service selected by pressing Enter (fallback)');
        }
      }
      return;
    } else {
      console.log('  ⚠️  Service input not found');
      return;
    }
  }

  // Employee dropdown logic (unchanged)
  const allVisibleWrappers = await page.locator('span.k-dropdown-wrap:visible, span.k-picker-wrap:visible').all();
  if (labelText === 'Employee') {
    if (allVisibleWrappers.length > 2) {
      const targetDropdown = allVisibleWrappers[2];
      console.log('  🖱️  Clicking Employee dropdown (index 2)...');
      await targetDropdown.click();
      await page.waitForTimeout(1000);
      console.log(`  ⌨️  Typing "${optionText}"...`);
      await page.keyboard.type(optionText, { delay: 200 });
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      console.log('  ✓ Employee selected');
      return;
    } else {
      console.log('  ⚠️  Employee dropdown not found');
      return;
    }
  }

  console.log(`  ⚠️  Could not find ${labelText} dropdown`);
}

async function selectTimeSlot(page, slotIndex) {
  // After clicking "Show Available Times", time slots appear
  // Look for clickable time elements (buttons or links)
  
  await page.waitForTimeout(2000);
  
  // Try different selectors for time slots
  const timeSelectors = [
    'button:has-text("AM")',
    'button:has-text("PM")',
    'a:has-text("AM")',
    'a:has-text("PM")',
    'div[role="button"]:has-text(":")',
    '[class*="time-slot"]',
    '[class*="timeSlot"]',
    '[class*="appointment-time"]'
  ];
  
  for (const selector of timeSelectors) {
    try {
      const slots = await page.locator(selector).all();
      if (slots.length > 0) {
        const slotToClick = slots[Math.min(slotIndex, slots.length - 1)];
        const text = await slotToClick.textContent();
        console.log(`  🖱️  Clicking time slot: ${text?.trim()}`);
        await slotToClick.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch (e) {
      continue;
    }
  }
  
  // Fallback: click any visible button that's not "Show Available Times"
  const buttons = await page.locator('button:visible').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && !text.includes('Show Available') && (text.includes(':') || text.includes('AM') || text.includes('PM'))) {
      console.log(`  🖱️  Clicking time: ${text.trim()}`);
      await btn.click();
      return;
    }
  }
  
  console.log('  ⚠️  Could not find time slots to click');
}

async function fillCustomerInfo(page, customerInfo) {
  // Wait for customer form to load
  await page.waitForTimeout(1000);
  
  // Find and fill all input fields
  const inputs = await page.locator('input[type="text"]:visible, input:not([type]):visible').all();
  
  console.log(`  📋 Found ${inputs.length} text input fields`);
  
  // Try to intelligently fill fields based on common patterns
  for (const input of inputs) {
    const name = await input.getAttribute('name') || '';
    const id = await input.getAttribute('id') || '';
    const placeholder = await input.getAttribute('placeholder') || '';
    
    const fieldIdentifier = (name + id + placeholder).toLowerCase();
    
    if (fieldIdentifier.includes('first') && !fieldIdentifier.includes('last')) {
      await input.fill(customerInfo.firstName);
      console.log('  ✓ Filled first name');
    } else if (fieldIdentifier.includes('last')) {
      await input.fill(customerInfo.lastName);
      console.log('  ✓ Filled last name');
    }
  }
  
  // Fill email only in the correct field (name='clientEmail')
  const emailInput = page.locator('input[type="email"][name="clientEmail"]:visible').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(customerInfo.email);
    console.log('  ✓ Filled email (clientEmail)');
  } else {
    console.log('  ⚠️  Email input with name="clientEmail" not found');
  }
  
  // Fill phone
  const phoneInput = page.locator('input[type="tel"]:visible').first();
  if (await phoneInput.count() > 0) {
    await phoneInput.fill(customerInfo.phone);
    console.log('  ✓ Filled phone');
  }
  
  // Fill notes/comments
  if (customerInfo.notes) {
    const notesField = page.locator('textarea:visible').first();
    if (await notesField.count() > 0) {
      await notesField.fill(customerInfo.notes);
      console.log('  ✓ Filled notes');
    }
  }

  // Click the Continue button to proceed
  const continueBtn = page.locator('a.button.booking-event[data-event="ProcessClientInfo"][data-submit="true"]:visible').first();
  if (await continueBtn.count() > 0) {
    console.log('  🖱️  Clicking Continue button to proceed...');
    await continueBtn.click();
    await page.waitForTimeout(2000);
    console.log('  ✓ Clicked Continue');
  } else {
    console.log('  ⚠️  Continue button not found after filling customer info');
  }
}

async function submitBooking(page) {
  // Look for submit button
  const submitSelectors = [
    'button:has-text("Book")',
    'button:has-text("Confirm")',
    'button:has-text("Submit")',
    'button:has-text("Complete")',
    'button[type="submit"]:visible',
    'input[type="submit"]:visible'
  ];
  
  for (const selector of submitSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.count() > 0) {
        const text = await btn.textContent();
        console.log(`  🖱️  Clicking: ${text?.trim() || 'Submit'}`);
        await btn.click();
        return;
      }
    } catch (e) {
      continue;
    }
  }
  
  console.log('  ⚠️  Submit button not found - form may be ready but not submitted');
}

// If this file is run directly via `node booking-script.js`, execute once
if (require.main === module) {
  bookAppointment()
    .then(() => {
      console.log('\n✅ Automation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Automation failed:', error);
      process.exit(1);
    });
}

// Export function so it can be used from a webhook handler
module.exports = { bookAppointment };