import {beforeEach,describe,expect,it,vi} from 'vitest';

const getSession=vi.fn(),getUser=vi.fn(),refreshSession=vi.fn(),invoke=vi.fn();
vi.mock('../src/lib/supabase',()=>({
 db:()=>({auth:{getSession,getUser,refreshSession},functions:{invoke}}),
 check:<T extends {error:unknown}>(result:T)=>{if(result.error)throw result.error;return result;},
}));
import {sendOfficeInvite} from '../src/lib/send-office-invite';

describe('office invite email',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  getSession.mockResolvedValue({data:{session:{access_token:'first-jwt'}},error:null});
  getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});
  refreshSession.mockResolvedValue({data:{session:{access_token:'fresh-jwt'}},error:null});
  invoke.mockResolvedValue({data:{accepted:true},error:null});
 });
 it('sends the signed-in access token to the protected function',async()=>{
  await sendOfficeInvite('invite-id','secret-token');
  expect(getUser).toHaveBeenCalledWith('first-jwt');
  expect(invoke).toHaveBeenCalledWith('send-office-invite',{
   body:{invite_id:'invite-id',token:'secret-token'},
   headers:{Authorization:'Bearer first-jwt'},
  });
  expect(refreshSession).not.toHaveBeenCalled();
 });
 it('refreshes an invalid session before sending',async()=>{
  getUser.mockResolvedValue({data:{user:null},error:new Error('expired')});
  await sendOfficeInvite('invite-id','secret-token');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer fresh-jwt');
 });
 it('retries once after a gateway 401 with a refreshed token',async()=>{
  invoke.mockResolvedValueOnce({data:null,error:{message:'gateway denied',context:{status:401}}});
  await sendOfficeInvite('invite-id','secret-token');
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-jwt');
 });
 it('does not claim delivery when the mail service rejects the message',async()=>{
  invoke.mockResolvedValue({data:null,error:{message:'failed',context:{status:502,json:async()=>({message:'SMTP غير جاهز'})}}});
  await expect(sendOfficeInvite('invite-id','secret-token')).rejects.toThrow('SMTP غير جاهز');
  expect(invoke).toHaveBeenCalledTimes(1);
 });
});
