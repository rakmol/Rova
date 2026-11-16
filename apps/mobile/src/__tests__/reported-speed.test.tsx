import {render,screen} from '@testing-library/react-native';
import type {ComplianceContext,ReportedSpeedLimit} from '@rova/shared';
import {currentReportedSpeed} from '../navigation/reported-speed';
import {SmartAlertPanel} from '../navigation/SmartAlertPanel';
import {SmartAlertEngine,emptySmartAlert} from '../navigation/smart-alerts';
jest.mock('../theme/ThemeProvider',()=>({useRovaTheme:()=>({theme:jest.requireActual('../theme/theme').resolveTheme('light','light')})}));
const now=Date.parse('2026-11-16T12:00:00Z');
const report:ReportedSpeedLimit={id:'TEST-REPORT',roadName:'TEST ONLY',verification:'reported',speedLimitKmh:80,reportedAt:'2026-11-16T00:00:00Z',expiresAt:'2026-12-16T00:00:00Z',sourceReference:'TEST owner report',sourceUrl:'https://example.com/test',validUntil:now+3000,geometry:{type:'LineString',coordinates:[[0,0],[.01,0]]}};
const data:ComplianceContext={fixTimestamp:now,checkedAt:now,validUntil:now,validForMeters:0,coordinate:[.003,0],limit:{status:'unknown',speedLimitKmh:null,reason:'no_road_match'},notices:[],enforcementStatus:'unavailable/unverified',reportedSpeedLimit:report};
const context={data,progressMeters:0,heading:90};
const fix={coordinate:[.003,0]as[number,number],heading:90,accuracy:5,timestamp:now,speed:30};
test('display reports require fresh aligned GPS and disappear off-road, paused or expired',()=>{
 expect(currentReportedSpeed(context,fix,now,true)).toEqual(report);
 expect(currentReportedSpeed(context,fix,now,false)).toBeNull();
 expect(currentReportedSpeed(context,{...fix,coordinate:[.003,.0004]},now,true)).toBeNull();
 expect(currentReportedSpeed(context,{...fix,accuracy:60},now,true)).toBeNull();
 expect(currentReportedSpeed(context,fix,now+3001,true)).toBeNull();
 expect(currentReportedSpeed({...context,data:{...data,limit:{status:'verified',speedLimitKmh:50,segmentId:'TEST',confidence:.99,units:'km/h'}}},fix,now,true)).toBeNull();
});
test('reported 80 never becomes a verified number or triggers a verified overspeed warning',()=>{
 const engine=new SmartAlertEngine();
 for(let t=0;t<10;t++){
  const result=engine.update({context:{...context,data:{...data,checkedAt:now+t*1000,fixTimestamp:now+t*1000}},fix:{...fix,timestamp:now+t*1000},now:now+t*1000,navigating:true,reliable:true,progressMeters:0,speedKmh:120,flags:{enabled:true,transitions:true,corridors:true}});
  expect(result.limitKmh).toBeNull();expect(result.alert).toBeNull();
 }
});
test('navigation displays a labelled report with its caution, and a verified lower limit takes precedence',async()=>{
 const view=await render(<SmartAlertPanel snapshot={emptySmartAlert()} vehicleType="private_car" audioEnabled onToggleAudio={()=>{}} reportedSpeed={report} compact/>);
 expect(screen.getByText('Reported limit: 80 km/h')).toBeTruthy();expect(screen.getByText('Not independently verified. Follow posted signs.')).toBeTruthy();
 await view.rerender(<SmartAlertPanel snapshot={{...emptySmartAlert(),state:'monitoring',limitKmh:50}} vehicleType="private_car" audioEnabled onToggleAudio={()=>{}} reportedSpeed={report} compact/>);
 expect(screen.queryByText('Reported limit: 80 km/h')).toBeNull();expect(screen.getByLabelText(/50 km\/h/)).toBeTruthy();
});
