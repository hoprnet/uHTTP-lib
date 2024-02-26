import * as Utils from './utils';
import * as Res from './result';

describe('test utils', function () {
    it('compares versions', function () {
        let res = Utils.versionCompare('0.0.1', '1.1.0');
        Res.assertOk(res);
        expect(res.res).toBe(Utils.VrsnCmp.MajorMismatch);
        res = Utils.versionCompare('1.1.0', '0.0.1');
        Res.assertOk(res);
        expect(res.res).toBe(Utils.VrsnCmp.MajorMismatch);
        res = Utils.versionCompare('1.1.0', '1.1.0');
        Res.assertOk(res);
        expect(res.res).toBe(Utils.VrsnCmp.Identical);
        res = Utils.versionCompare('0.0.1', '0.0.3');
        Res.assertOk(res);
        expect(res.res).toBe(Utils.VrsnCmp.PatchMismatch);
        res = Utils.versionCompare('1.3.3', '1.4.0');
        Res.assertOk(res);
        expect(res.res).toBe(Utils.VrsnCmp.MinorMismatch);
        res = Utils.versionCompare('', '1.4.0');
        expect(Res.isErr(res));
    });
});
