import type {Metadata,Viewport} from 'next';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import './globals.css';
export const metadata:Metadata={title:'مركز ؟ | مذاكرتك، حبة حبة',description:'مساحتك الشخصية لتنظيم المذاكرة، التركيز ومراجعة الفهم.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'مركز ؟'},icons:{icon:'/icon.svg',apple:'/apple-touch-icon.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#F5F0E5'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>;}
