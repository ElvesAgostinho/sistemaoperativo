import nodemailer from 'nodemailer';

async function test() {
    console.log('Testing SMTP connection...');
    const transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 465, // Let's try 465 first
        secure: true,
        auth: {
            user: 'test@hostinger.com', // fake just for connection test
            pass: 'fake_password'
        }
    });

    try {
        await transporter.verify();
        console.log('Connection OK');
    } catch (e: any) {
        console.log('Connection Failed 465:', e.message);
    }

    const transporter2 = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 587,
        secure: false,
        auth: {
            user: 'test@hostinger.com',
            pass: 'fake_password'
        }
    });

    try {
        await transporter2.verify();
        console.log('Connection OK');
    } catch (e: any) {
        console.log('Connection Failed 587:', e.message);
    }
}

test();
