import { OpenSheetMusicDisplay } from "../../../src/OpenSheetMusicDisplay/OpenSheetMusicDisplay";
import { Note } from "../../../src/MusicalScore/VoiceData/Note";
import { TestUtils } from "../../Util/TestUtils";

/**
 * A line cut from a score that opens on a note continuing a tie from the line before and tied on again
 * (Bantock's "Celestial Weaver" line 7): its tie stop has nothing open, its tie start must still begin a tie.
 */
const OPENS_ON_A_TIE_STOP_AND_START: string = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key>
    <time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/><tie type="start"/>
      <voice>1</voice><type>quarter</type><notations><tied type="stop"/><tied type="start"/></notations></note>
    <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/>
      <voice>1</voice><type>quarter</type><notations><tied type="stop"/></notations></note>
  </measure></part>
</score-partwise>`;

describe("A line opening on a note that stops and starts a tie", () => {
    it("ties that note to the next one", () => {
        const div: HTMLElement = TestUtils.getDivElement(document);
        const osmd: OpenSheetMusicDisplay = new OpenSheetMusicDisplay(div, { autoResize: false, backend: "svg" });
        return osmd.load(OPENS_ON_A_TIE_STOP_AND_START).then(() => {
            osmd.render();
            const notes: Note[] = osmd.Sheet.SourceMeasures[0].VerticalSourceStaffEntryContainers
                .flatMap((container) => container.StaffEntries)
                .filter((entry) => entry !== undefined)
                .flatMap((entry) => entry.VoiceEntries)
                .flatMap((voiceEntry) => voiceEntry.Notes);
            chai.expect(notes.length).to.equal(2);
            chai.expect(notes[0].NoteTie).to.not.equal(undefined);
            chai.expect(notes[0].NoteTie.Notes.length).to.equal(2);
            chai.expect(notes[1].NoteTie).to.equal(notes[0].NoteTie);
        });
    });
});
