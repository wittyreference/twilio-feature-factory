// ABOUTME: Searches available Twilio phone numbers by country, area code, and capabilities.
// ABOUTME: Protected endpoint for querying number inventory before purchase.

exports.handler = async (context, event, callback) => {
  const { countryCode, areaCode, contains, smsEnabled, voiceEnabled, limit } = event;

  const client = context.getTwilioClient();

  const searchParams = {
    limit: limit ? parseInt(limit, 10) : 10,
  };

  if (areaCode) {
    searchParams.areaCode = parseInt(areaCode, 10);
  }
  if (contains) {
    searchParams.contains = contains;
  }
  if (smsEnabled !== undefined) {
    searchParams.smsEnabled = smsEnabled === 'true' || smsEnabled === true;
  }
  if (voiceEnabled !== undefined) {
    searchParams.voiceEnabled = voiceEnabled === 'true' || voiceEnabled === true;
  }

  try {
    const numbers = await client.availablePhoneNumbers(countryCode || 'US').local.list(searchParams);
    return callback(null, {
      success: true,
      numbers: numbers.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        capabilities: n.capabilities,
      })),
      count: numbers.length,
    });
  } catch (error) {
    return callback(null, { success: false, error: error.message });
  }
};
