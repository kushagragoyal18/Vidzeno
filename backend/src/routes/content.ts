import { Router, Request, Response } from 'express';
import { marked } from 'marked';

const contentRouter = Router();

// FAQ data
const faqData = `
# Frequently Asked Questions

## General Questions

### What is Vidzeno?

Vidzeno is a fast, easy-to-use online video converter. Simply upload your video, choose your desired output format, and we'll handle the rest. No software installation required.

### Is Vidzeno free to use?

Yes! Vidzeno offers a free tier that allows you to convert up to 2 videos per day with a maximum file size of 500MB. For heavier usage, we offer a Premium plan with unlimited conversions and support for files up to 4GB.

### What video formats do you support?

We support a wide range of input formats:
- **MP4** - Most compatible format
- **AVI** - Microsoft video format
- **MOV** - Apple QuickTime format
- **MKV** - Matroska video container
- **WEBM** - Web video format
- **FLV** - Flash video format
- **WMV** - Windows Media Video

Output formats include: MP4, AVI, MOV, MKV, WEBM, GIF, and MP3 (audio only).

## Free vs Premium

### What are the differences between Free and Premium?

| Feature | Free | Premium |
|---------|------|---------|
| Max file size | 500 MB | 4 GB |
| Daily conversions | 2 | Unlimited |
| Watermark | Yes | No |
| Queue priority | Standard | Priority |
| Processing speed | Standard | Fast |

### How much does Premium cost?

Premium is available as:
- **Monthly**: $9.99/month
- **Yearly**: $79.99/year (save 33%)

### Can I cancel my subscription anytime?

Yes, you can cancel your Premium subscription at any time from your account settings. You'll continue to have access until the end of your billing period.

## Technical Questions

### How long does conversion take?

Conversion time depends on file size and current queue length:
- **Free users**: Typically 3-5 minutes for standard files
- **Premium users**: Typically 1-2 minutes with priority processing

### What happens to my files after conversion?

Uploaded files are automatically deleted after 24 hours for privacy and storage management. We recommend downloading your converted files as soon as they're ready.

### Is my data secure?

Yes! All file transfers are encrypted using HTTPS. Files are stored securely and automatically deleted after 24 hours. We don't share your data with third parties.

### Why is there a watermark on free conversions?

The watermark helps us promote Vidzeno to new users. If you'd like conversions without a watermark, consider upgrading to Premium.

## Troubleshooting

### My upload is failing

Check the following:
1. File size is under 500MB (Free) or 4GB (Premium)
2. File format is supported (see list above)
3. Your internet connection is stable
4. Try using a different browser

### My conversion is stuck

If your conversion has been processing for more than 10 minutes:
1. Refresh the page to check status
2. Check your email for completion notifications
3. Contact support if the issue persists

### The output quality is poor

Make sure you're selecting an appropriate output format. MP4 is recommended for most uses as it provides good quality with reasonable file size.

## Contact Us

### How can I contact support?

If you have any questions or issues, please contact us at:
- **Email**: support@vidzeno.com
- **Response time**: We typically respond within 24 hours

---

*Last updated: January 2024*
`;

// Help/FAQ endpoint
contentRouter.get('/faq', (_req: Request, res: Response) => {
  const html = marked(faqData);
  res.json({
    content: faqData,
    html,
  });
});

// Contact form endpoint
contentRouter.post('/contact', async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body;

  // Validate input
  if (!email || !message) {
    res.status(400).json({ error: 'Email and message are required' });
    return;
  }

  // In production, send email here
  console.log('Contact form submission:', { name, email, subject, message });

  res.json({
    success: true,
    message: 'Thank you for your message. We will respond within 24 hours.',
  });
});

export default contentRouter;
