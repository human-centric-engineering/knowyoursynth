// Cable groups that several sounds on the 900-series systems share. The module ids (m921a_1, cp35, …) are the same on
// every system that has the module, so these work on the System 15, 35 and 55 alike.
export const KEYS = [['j.cm1a.cv_1', 'j.m921a_1.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link']];
export const LINK2 = [['j.m921b_1.freq_link_thru', 'j.m921b_2.freq_link']];
export const TRIGS = [['j.cm1a.trig_upper', 'j.cp35.mult_a'], ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.cp35.mult_a_out_2', 'j.m911_2.strig']];
export const VOICE = [['j.cp3am_1.out_pos_1', 'j.m904a.sig_in'], ['j.m904a.sig_out', 'j.m902_1.sig_in_pos'], ['j.m902_1.out_pos', 'j.out.l']];
