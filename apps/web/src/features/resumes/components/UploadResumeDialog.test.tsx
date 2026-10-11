import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk, resume, version } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { resumesApi } from '../services/resumes-api';

async function openDialog() {
  renderApp('/resumes');
  await userEvent.click(await screen.findByRole('button', { name: 'Add resume' }));
  return screen.findByRole('dialog');
}

describe('UploadResumeDialog', () => {
  it('rejects unsupported files before uploading', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /resumes?status=ACTIVE': { body: [] } });
    const upload = vi.spyOn(resumesApi, 'upload');
    const dialog = await openDialog();

    await userEvent.upload(
      within(dialog).getByLabelText('Resume file'),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      { applyAccept: false },
    );

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Upload a PDF or DOCX file.');
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows progress, then processing, then success only after the backend confirms parsing', async () => {
    let parseStatus = 'PROCESSING';
    mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [] },
      'GET /resumes/r1/versions/v1/parse-status': () => ({
        body: { versionId: 'v1', parseStatus, parseError: null, parsedAt: null },
      }),
    });
    let finishUpload: () => void = () => undefined;
    vi.spyOn(resumesApi, 'upload').mockImplementation((_file, _fields, onProgress) => {
      onProgress?.(72);
      return new Promise((resolve) => {
        finishUpload = () =>
          resolve(
            resume({
              currentVersion: null,
              latestVersion: version({ status: 'DRAFT', parseStatus: 'PENDING' }),
            }),
          );
      });
    });

    const dialog = await openDialog();
    await userEvent.upload(
      within(dialog).getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'Angular_Resume.pdf', { type: 'application/pdf' }),
    );
    expect(within(dialog).getByLabelText(/Resume name/)).toHaveValue('Angular Resume');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

    expect(await within(dialog).findByText('Uploading resume… 72%')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
      'aria-valuenow',
      '72',
    );

    finishUpload();
    expect(await within(dialog).findByText('Extracting information…')).toBeInTheDocument();
    expect(within(dialog).queryByText('Resume processed.')).not.toBeInTheDocument();

    parseStatus = 'COMPLETED';
    expect(
      await within(dialog).findByText('Resume processed.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Review information' })).toHaveAttribute(
      'href',
      '/resumes/r1/versions/v1/review',
    );
  });

  it('shows the server error when the upload is rejected', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /resumes?status=ACTIVE': { body: [] } });
    const { ApiError } = await import('../../../lib/api/api-error');
    vi.spyOn(resumesApi, 'upload').mockRejectedValue(
      new ApiError(
        415,
        'UNSUPPORTED_FILE_TYPE',
        'The file content does not match a PDF or DOCX document.',
      ),
    );

    const dialog = await openDialog();
    await userEvent.upload(
      within(dialog).getByLabelText('Resume file'),
      new File(['fake'], 'cv.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent('does not match a PDF or DOCX'),
    );
  });
  it('does not hide a parsing failure: offers retry, another file, or manual entry', async () => {
    let parseStatus = 'FAILED';
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [] },
      'GET /resumes/r1/versions/v1/parse-status': () => ({
        body: {
          versionId: 'v1',
          parseStatus,
          parseError: 'This PDF has no selectable text.',
          parsedAt: null,
        },
      }),
      'POST /resumes/r1/versions/v1/parse': () => {
        parseStatus = 'PROCESSING';
        return {
          status: 202,
          body: { versionId: 'v1', parseStatus, parseError: null, parsedAt: null },
        };
      },
    });
    vi.spyOn(resumesApi, 'upload').mockResolvedValue(
      resume({
        currentVersion: null,
        latestVersion: version({ status: 'DRAFT', parseStatus: 'PENDING' }),
      }),
    );

    const dialog = await openDialog();
    await userEvent.upload(
      within(dialog).getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

    expect(await within(dialog).findByText('Resume could not be parsed.')).toBeInTheDocument();
    expect(within(dialog).getByText(/This PDF has no selectable text\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Continue manually' })).toHaveAttribute(
      'href',
      '/resumes/r1/versions/v1/review',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(api.find('POST', '/resumes/r1/versions/v1/parse')).toHaveLength(1);
    expect(await within(dialog).findByText('Extracting information…')).toBeInTheDocument();
  });

  it('lets the user pick another file after a parsing failure', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [] },
      'GET /resumes/r1/versions/v1/parse-status': {
        body: { versionId: 'v1', parseStatus: 'FAILED', parseError: 'Unreadable.', parsedAt: null },
      },
    });
    vi.spyOn(resumesApi, 'upload').mockResolvedValue(
      resume({
        currentVersion: null,
        latestVersion: version({ status: 'DRAFT', parseStatus: 'PENDING' }),
      }),
    );
    const dialog = await openDialog();
    await userEvent.upload(
      within(dialog).getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Upload another file' }),
    );
    expect(within(dialog).getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
