import { OpenSheetMusicDisplay } from "../../../src/OpenSheetMusicDisplay/OpenSheetMusicDisplay";
import { DynamicEnum } from "../../../src/MusicalScore/VoiceData/Expressions/InstantaneousDynamicExpression";
import { MultiExpression } from "../../../src/MusicalScore/VoiceData/Expressions/MultiExpression";
import { GraphicalInstantaneousDynamicExpression } from "../../../src/MusicalScore/Graphical/GraphicalInstantaneousDynamicExpression";
import { VexFlowInstantaneousDynamicExpression } from "../../../src/MusicalScore/Graphical/VexFlow/VexFlowInstantaneousDynamicExpression";
import { TestUtils } from "../../Util/TestUtils";

/**
 * "pf" and "ffz" are dynamics. MusicXML writes "pf" as <pf/> (MuseScore exports it as <other-dynamics>pf</other-dynamics>)
 * and has no element for "ffz", which arrives as <other-dynamics>ffz</other-dynamics>. Each is read and drawn as a dynamic,
 * like the "sfz" beside them.
 */
const PF_AND_FFZ: string = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <direction placement="below"><direction-type><dynamics><pf/></dynamics></direction-type><sound dynamics="98"/></direction>
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <direction placement="below"><direction-type><dynamics><other-dynamics>ffz</other-dynamics></dynamics></direction-type></direction>
    <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <direction placement="below"><direction-type><dynamics><other-dynamics>pf</other-dynamics></dynamics></direction-type></direction>
    <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <direction placement="below"><direction-type><dynamics><sfz/></dynamics></direction-type></direction>
    <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`;

describe("The dynamics pf and ffz", () => {
    it("are read and drawn as dynamics", () => {
        const div: HTMLElement = TestUtils.getDivElement(document);
        const osmd: OpenSheetMusicDisplay = new OpenSheetMusicDisplay(div, { autoResize: false, backend: "svg" });
        return osmd.load(PF_AND_FFZ).then(() => {
            osmd.render();
            const read: DynamicEnum[] = osmd.Sheet.SourceMeasures[0].StaffLinkedExpressions[0]
                .map((expression: MultiExpression) => expression.InstantaneousDynamic?.DynEnum);
            chai.expect(read).to.deep.equal([DynamicEnum.pf, DynamicEnum.ffz, DynamicEnum.pf, DynamicEnum.sfz]);
            const drawn: string[] = osmd.GraphicSheet.MusicPages[0].MusicSystems[0].StaffLines[0].AbstractExpressions
                .filter((expression) => expression instanceof GraphicalInstantaneousDynamicExpression)
                .map((expression) => (expression as VexFlowInstantaneousDynamicExpression).Expression);
            chai.expect(drawn).to.deep.equal(["pf", "ffz", "pf", "sfz"]);
        });
    });

    it("keep every earlier dynamic's number", () => {
        chai.expect(DynamicEnum.fz).to.equal(23);
        chai.expect(DynamicEnum.other).to.equal(24);
        chai.expect(DynamicEnum.ffz).to.equal(25);
        chai.expect(DynamicEnum.pf).to.equal(26);
    });
});
