import {Suspense}from'react';
import {Dashboard}from'../components/Dashboard';
export default function Home(){return <Suspense fallback={<main>Loading ROVA Operations…</main>}><Dashboard/></Suspense>;}