import { scrollMenu } from '../components/scrollMenu';
test('the menu hides on downward travel, returns on upward travel, and ignores tiny jitter',()=>{
  const change=jest.fn(),scroll=scrollMenu(change);
  scroll(0);expect(change).toHaveBeenLastCalledWith(false);
  scroll(30);expect(change).toHaveBeenLastCalledWith(true);
  change.mockClear();scroll(31);scroll(30);expect(change).not.toHaveBeenCalled();
  scroll(25);scroll(5);expect(change).toHaveBeenLastCalledWith(false);
  scroll(-20);expect(change).toHaveBeenLastCalledWith(false);
});
