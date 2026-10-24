import type {Metadata,Viewport} from 'next';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import './globals.css';
import {BASE_PATH} from '@/lib/base-path';
export const metadata:Metadata={title:'مركز ؟ | للدراسة والعمل',description:'مساحة للطلاب والموظفين لتنظيم المهام والتركيز وبناء الاستمرار.',manifest:`${BASE_PATH}/manifest.webmanifest`,appleWebApp:{capable:true,statusBarStyle:'default',title:'مركز ؟'},icons:{icon:`${BASE_PATH}/icon.svg`,apple:`${BASE_PATH}/apple-touch-icon.png`}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#F5F0E5'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>;}
