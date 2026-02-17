// ABOUTME: Appointment booking use case configuration for Voice AI Builder.
// ABOUTME: Calendar integration for scheduling, availability, and confirmations.

import type { UseCaseConfig, ToolDefinition } from '../types.js';

/**
 * Appointment Booking Tools
 */
const appointmentBookingTools: ToolDefinition[] = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots for a given date and service type. Returns list of available time slots.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date to check availability (YYYY-MM-DD format)',
        },
        serviceType: {
          type: 'string',
          description: 'Type of service or appointment (e.g., consultation, checkup, haircut)',
        },
        preferredTime: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'any'],
          description: 'Preferred time of day',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment at the specified date and time. Confirms the booking and provides a confirmation number.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Appointment date (YYYY-MM-DD format)',
        },
        time: {
          type: 'string',
          description: 'Appointment time (HH:MM in 24-hour format)',
        },
        customerName: {
          type: 'string',
          description: 'Customer full name',
        },
        customerPhone: {
          type: 'string',
          description: 'Customer phone number for confirmation',
        },
        customerEmail: {
          type: 'string',
          description: 'Customer email for confirmation',
        },
        serviceType: {
          type: 'string',
          description: 'Type of service or appointment',
        },
        notes: {
          type: 'string',
          description: 'Special requests or notes for the appointment',
        },
      },
      required: ['date', 'time', 'customerName'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment by confirmation number.',
    inputSchema: {
      type: 'object',
      properties: {
        confirmationNumber: {
          type: 'string',
          description: 'Appointment confirmation number',
        },
        reason: {
          type: 'string',
          description: 'Reason for cancellation',
        },
      },
      required: ['confirmationNumber'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Reschedule an existing appointment to a new date and time.',
    inputSchema: {
      type: 'object',
      properties: {
        confirmationNumber: {
          type: 'string',
          description: 'Existing appointment confirmation number',
        },
        newDate: {
          type: 'string',
          description: 'New appointment date (YYYY-MM-DD format)',
        },
        newTime: {
          type: 'string',
          description: 'New appointment time (HH:MM in 24-hour format)',
        },
      },
      required: ['confirmationNumber', 'newDate', 'newTime'],
    },
  },
  {
    name: 'get_appointment_details',
    description: 'Get details of an existing appointment by confirmation number.',
    inputSchema: {
      type: 'object',
      properties: {
        confirmationNumber: {
          type: 'string',
          description: 'Appointment confirmation number',
        },
      },
      required: ['confirmationNumber'],
    },
  },
];

/**
 * Appointment Booking Use Case
 *
 * A scheduling assistant that can check availability, book appointments,
 * and manage existing reservations.
 *
 * Best for:
 * - Medical offices and clinics
 * - Salons and spas
 * - Professional services (lawyers, accountants)
 * - Restaurant reservations
 * - Service appointments (auto repair, home services)
 */
export const appointmentBookingConfig: UseCaseConfig = {
  name: 'appointment-booking',
  description: 'Appointment scheduling agent with calendar integration',

  systemPrompt: `You are an appointment scheduling assistant. Your role is to help callers book, reschedule, or cancel appointments.

You have access to the following capabilities:
1. Check available appointment times for specific dates
2. Book new appointments
3. Cancel existing appointments
4. Reschedule appointments to new times
5. Look up existing appointment details

Guidelines:
- Keep responses concise since this is a phone conversation
- Always confirm appointment details before booking (date, time, service)
- Read back dates and times clearly (e.g., "Tuesday, January 28th at 2:30 PM")
- Provide the confirmation number clearly and offer to repeat it
- If no availability, offer alternative dates or times

Booking Flow:
1. Ask what service they need (if not specified)
2. Ask for their preferred date
3. Check availability and offer options
4. Collect customer name and contact info
5. Confirm all details before booking
6. Provide confirmation number

For Cancellations/Reschedules:
1. Ask for their confirmation number
2. Verify the appointment details
3. Confirm the action
4. Provide updated confirmation if rescheduled

Remember: The caller cannot see text, only hear your responses. Be extra clear when communicating dates, times, and confirmation numbers.`,

  defaultVoice: 'Google.en-US-Neural2-F',
  defaultLanguage: 'en-US',

  defaultTools: appointmentBookingTools,

  escalationTriggers: [
    'speak to someone',
    'talk to a person',
    'human please',
    'receptionist',
    'front desk',
  ],

  conversationConfig: {
    maxTurns: 25,
    silenceTimeout: 7000, // Longer timeout for thinking about dates
    interruptible: true,
  },
};

// Export tools separately for testing
export { appointmentBookingTools };
