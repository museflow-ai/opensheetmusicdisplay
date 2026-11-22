import { OpenSheetMusicDisplay } from "../../../src/OpenSheetMusicDisplay/OpenSheetMusicDisplay";
import { Note } from "../../../src/MusicalScore/VoiceData/Note";
import { TestUtils } from "../../Util/TestUtils";

function score(partContent: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${partContent}</part>
</score-partwise>`;
}

const ATTRIBUTES: string = `<attributes><divisions>2</divisions><key><fifths>0</fifths></key>
  <time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves>
  <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;

function note(step: string, octave: number, duration: number, type: string, voice: number, staff: number,
              tie: string = ""): string {
    const tieElement: string = tie ? `<tie type="${tie}"/>` : "";
    const tied: string = tie ? `<notations><tied type="${tie}"/></notations>` : "";
    return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${tieElement}
  <voice>${voice}</voice><type>${type}</type><staff>${staff}</staff>${tied}</note>`;
}

/**
 * Voice 7 is first met on the upper staff, then crosses to the lower staff, where its D4 is tied into voice 6's
 * D4 in the next bar (as Debussy's "Chevaux de bois" is written).
 */
const TIE_INTO_ANOTHER_VOICE: string = score(`<measure number="1">${ATTRIBUTES}
  ${note("A", 4, 2, "quarter", 1, 1)}${note("A", 4, 2, "quarter", 1, 1)}
  <backup><duration>4</duration></backup>
  ${note("C", 5, 2, "quarter", 7, 1)}${note("D", 4, 2, "quarter", 7, 2, "start")}
  <backup><duration>4</duration></backup>
  ${note("G", 2, 4, "half", 6, 2)}
</measure><measure number="2">
  ${note("A", 4, 4, "half", 1, 1)}
  <backup><duration>4</duration></backup>
  ${note("D", 4, 2, "quarter", 6, 2, "stop")}${note("D", 4, 2, "quarter", 6, 2)}
</measure>`);

/** The same tie with voice 7 first met on the lower staff (already right). */
const TIE_INTO_ANOTHER_VOICE_SAME_STAFF: string = score(`<measure number="1">${ATTRIBUTES}
  ${note("A", 4, 4, "half", 1, 1)}
  <backup><duration>4</duration></backup>
  ${note("G", 2, 4, "half", 6, 2)}
  <backup><duration>4</duration></backup>
  ${note("B", 3, 2, "quarter", 7, 2)}${note("D", 4, 2, "quarter", 7, 2, "start")}
</measure><measure number="2">
  ${note("A", 4, 4, "half", 1, 1)}
  <backup><duration>4</duration></backup>
  ${note("D", 4, 2, "quarter", 6, 2, "stop")}${note("D", 4, 2, "quarter", 6, 2)}
</measure>`);

function notesOfPitch(osmd: OpenSheetMusicDisplay, step: number): Note[] {
    return osmd.Sheet.SourceMeasures
        .flatMap((measure) => measure.VerticalSourceStaffEntryContainers)
        .flatMap((container) => container.StaffEntries)
        .filter((entry) => entry !== undefined)
        .flatMap((entry) => entry.VoiceEntries)
        .flatMap((voiceEntry) => voiceEntry.Notes)
        .filter((candidate) => candidate.Pitch !== undefined && candidate.Pitch.getHalfTone() === step);
}

function load(xml: string): Promise<OpenSheetMusicDisplay> {
    const div: HTMLElement = TestUtils.getDivElement(document);
    const osmd: OpenSheetMusicDisplay = new OpenSheetMusicDisplay(div, { autoResize: false, backend: "svg" });
    return osmd.load(xml).then(() => osmd);
}

// D4 (MIDI 62) is half tone 50 in OSMD (MIDI = half tone + 12)
const D4: number = 50;

describe("A tie into another voice on the same staff", () => {
    it("joins the two notes when the first voice was first met on the other staff", () => {
        return load(TIE_INTO_ANOTHER_VOICE).then((osmd: OpenSheetMusicDisplay) => {
            const notes: Note[] = notesOfPitch(osmd, D4);
            chai.expect(notes.length).to.equal(3);
            chai.expect(notes[0].NoteTie).to.not.equal(undefined);
            chai.expect(notes[0].NoteTie.Notes.length).to.equal(2);
            chai.expect(notes[1].NoteTie).to.equal(notes[0].NoteTie);
            chai.expect(notes[2].NoteTie).to.equal(undefined);
        });
    });

    it("still joins them when the first voice started on that staff", () => {
        return load(TIE_INTO_ANOTHER_VOICE_SAME_STAFF).then((osmd: OpenSheetMusicDisplay) => {
            const notes: Note[] = notesOfPitch(osmd, D4);
            chai.expect(notes.length).to.equal(3);
            chai.expect(notes[0].NoteTie.Notes.length).to.equal(2);
            chai.expect(notes[1].NoteTie).to.equal(notes[0].NoteTie);
        });
    });
});
